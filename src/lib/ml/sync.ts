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
}

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

  // Visitas por dia dos anúncios ativos
  const active = items.filter((i) => i.status === "active");
  const series: VisitSeries[] = [];
  await mapLimit(active, 5, async (item) => {
    try {
      const w = await api.visits(item.id, 30);
      const daily = w.results.map((r) => ({ day: r.date.slice(0, 10), visits: r.total }));
      series.push({ itemId: item.id, title: item.title, daily });
      await saveVisits(item.id, daily);
    } catch (err) {
      console.warn(`Visitas de ${item.id} indisponíveis`, err);
    }
  });

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
  await backfillOrders(api, accountId, sellerId, new Date(account.orders_history_since ?? from), {
    deadline: startedAt + 120_000,
  }).catch((err) => console.error("Histórico de pedidos interrompido", accountId, err));

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

  return { items: items.length, orders: orders.length, questions: questions.length, alerts: alerts.length + lowStock.length };
}
