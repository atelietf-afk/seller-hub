import "server-only";
import { reputationAlert, visitsDropAlerts, type VisitSeries } from "@/lib/analytics/alerts";
import { accountById, settingsOf } from "@/lib/data/accounts";
import { query } from "@/lib/db";
import { syncAds } from "./ads-sync";
import { backfillOrders } from "./backfill";
import { syncSpy } from "./spy-sync";
import { mapLimit, pushEvents, saveVisits, upsertItems, upsertOrder, upsertQuestion } from "./store";
import { apiFor } from "./tokens";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface SyncResult {
  items: number;
  orders: number;
  questions: number;
  alerts: number;
  visits: { fetched: number; failed: number; reused: boolean };
  historySince: string | null; // até onde o histórico de pedidos já chegou
  seconds: number;
}

const VISITS_MAX_AGE_MS = 6 * 3600_000;

/**
 * Sincronização completa de uma conta: anúncios, visitas (30 dias), pedidos,
 * perguntas e reputação. Os webhooks cuidam do tempo real; isto corrige o que
 * eles perderem e calcula os alertas que dependem de histórico.
 */
export async function syncAccount(accountId: string): Promise<SyncResult> {
  const account = await accountById(accountId);
  if (!account) throw new Error(`Conta ${accountId} não encontrada`);
  const settings = await settingsOf(account.owner_id);

  const startedAt = Date.now();
  const api = apiFor(accountId);
  const sellerId = Number(account.ml_user_id);
  const today = new Date().toISOString().slice(0, 10);

  // Reputação
  const user = await api.user(sellerId);
  const prevLevel = account.reputation?.level_id;
  const repAlert = reputationAlert(prevLevel, user.seller_reputation?.level_id, today);

  // Anúncios
  const ids = await api.itemIds(sellerId);
  const items = await api.items(ids);
  await upsertItems(accountId, items);

  // Visitas por dia dos anúncios ativos. Mudam devagar e custam uma chamada por anúncio,
  // então só buscamos de novo depois de 6 horas (evita o limite de chamadas do ML).
  const active = items.filter((i) => i.status === "active");
  const series: VisitSeries[] = [];
  const visits = { fetched: 0, failed: 0, reused: false };
  const visitsFresh =
    account.visits_synced_at && Date.now() - new Date(account.visits_synced_at).getTime() < VISITS_MAX_AGE_MS;
  if (visitsFresh) {
    visits.reused = true;
    const rows = await query<{ item_id: string; day: string; visits: number }>(
      `select v.item_id, v.day, v.visits from item_visits_daily v join items i on i.id = v.item_id
       where i.account_id = $1 and i.status = 'active' and v.day > current_date - 30 order by v.day`,
      [accountId],
    );
    const byItem = new Map<string, { day: string; visits: number }[]>();
    for (const r of rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), { day: r.day, visits: r.visits }]);
    for (const item of active) series.push({ itemId: item.id, title: item.title, daily: byItem.get(item.id) ?? [] });
  } else {
    await mapLimit(active, 3, async (item) => {
      try {
        const w = await api.visits(item.id, 30);
        const daily = w.results.map((r) => ({ day: r.date.slice(0, 10), visits: r.total }));
        series.push({ itemId: item.id, title: item.title, daily });
        await saveVisits(item.id, daily);
        visits.fetched++;
      } catch (err) {
        visits.failed++;
        console.warn(`Visitas de ${item.id} indisponíveis`, err instanceof Error ? err.message.slice(0, 160) : err);
      }
    });
    // Só marca como atualizado se a maioria deu certo; senão tenta de novo na próxima.
    if (visits.fetched >= visits.failed) await query("update ml_accounts set visits_synced_at = now() where id = $1", [accountId]);
  }

  // Pedidos: 30 dias na primeira vez, depois desde a última sincronização (com 1 dia de folga).
  const from = account.last_synced_at
    ? new Date(new Date(account.last_synced_at).getTime() - 24 * 3600 * 1000)
    : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const orders = await api.ordersSince(sellerId, from);
  await mapLimit(orders, 4, (o) => upsertOrder(api, accountId, sellerId, o));
  if (!account.orders_history_since) {
    await query("update ml_accounts set orders_history_since = $2 where id = $1", [accountId, from.toISOString()]);
  }

  // Histórico mais antigo, aos poucos, com limite de tempo para caber na função.
  const historySince = await backfillOrders(api, accountId, sellerId, new Date(account.orders_history_since ?? from), {
    deadline: startedAt + 120_000,
  }).catch((err) => {
    console.error("Histórico de pedidos interrompido", accountId, err);
    return null;
  });

  // Perguntas sem resposta
  const questions = await api.unansweredQuestions(sellerId);
  for (const q of questions) await upsertQuestion(accountId, q);

  // Alertas
  const alerts = visitsDropAlerts(series, settings.visits_drop_alert, today);
  if (repAlert) alerts.push(repAlert);
  const lowStock = active.filter((i) => i.available_quantity === 0);
  await pushEvents(accountId, [
    ...alerts,
    ...lowStock.map((i) => ({
      kind: "alert" as const,
      severity: "critical" as const,
      title: "Anúncio sem estoque",
      body: `"${i.title}" (${brl(i.price)}) está ativo com estoque zerado.`,
      itemId: i.id,
      dedupeKey: `no-stock:${i.id}:${today}`,
    })),
  ]);

  await query("update ml_accounts set nickname = $2, reputation = $3, last_synced_at = now() where id = $1", [
    accountId,
    user.nickname,
    JSON.stringify(user.seller_reputation ?? null),
  ]);

  // Publicidade e espião por último: nunca derrubam a sincronização principal.
  await syncAds(accountId);
  await syncSpy(accountId).catch((err) => console.error("Espião falhou", accountId, err));

  const result = {
    items: items.length,
    orders: orders.length,
    questions: questions.length,
    alerts: alerts.length + lowStock.length,
    visits,
    historySince: historySince?.toISOString() ?? null,
    seconds: Math.round((Date.now() - startedAt) / 1000),
  };
  await query("update ml_accounts set last_sync_result = $2 where id = $1", [accountId, JSON.stringify(result)]);
  console.info("Sincronização concluída", accountId, JSON.stringify(result));
  return result;
}
