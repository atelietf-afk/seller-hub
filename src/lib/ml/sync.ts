import "server-only";
import { reputationAlert, visitsDropAlerts, type VisitSeries } from "@/lib/analytics/alerts";
import { adminClient } from "@/lib/supabase/admin";
import { mapLimit, pushEvents, upsertItems, upsertOrder, upsertQuestion } from "./store";
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
  const db = adminClient();
  const { data: account, error } = await db.from("ml_accounts").select("*").eq("id", accountId).single();
  if (error || !account) throw new Error(`Conta ${accountId} não encontrada`);
  const { data: settings } = await db.from("seller_settings").select("*").eq("owner_id", account.owner_id).maybeSingle();

  const api = apiFor(accountId);
  const sellerId = Number(account.ml_user_id);
  const today = new Date().toISOString().slice(0, 10);

  // Reputação
  const user = await api.user(sellerId);
  const prevLevel = account.reputation?.level_id as string | undefined;
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
      if (daily.length) {
        await db.from("item_visits_daily").upsert(daily.map((d) => ({ item_id: item.id, day: d.day, visits: d.visits })));
      }
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

  // Perguntas sem resposta
  const questions = await api.unansweredQuestions(sellerId);
  for (const q of questions) await upsertQuestion(accountId, q);

  // Alertas
  const alerts = visitsDropAlerts(series, Number(settings?.visits_drop_alert ?? 0.3), today);
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

  await db
    .from("ml_accounts")
    .update({ nickname: user.nickname, reputation: user.seller_reputation ?? null, last_synced_at: new Date().toISOString() })
    .eq("id", accountId);

  return { items: items.length, orders: orders.length, questions: questions.length, alerts: alerts.length + lowStock.length };
}
