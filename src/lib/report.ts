import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeFunnel, type ItemFunnel } from "./analytics/funnel";
import { lineProfit, sumProfits, type LineProfit } from "./analytics/profit";

// Monta os números da conta num período. Recebe o cliente do banco para servir
// tanto às páginas (cliente do usuário, com RLS) quanto ao cron (service role).

export interface DayPoint {
  day: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface AccountReport {
  periodDays: number;
  totals: LineProfit & { orders: number; units: number; visits: number; conversion: number };
  previous: { revenue: number; orders: number; profit: number };
  daily: DayPoint[];
  funnel: (ItemFunnel & { revenue: number; profit: number; price: number; thumbnail: string | null; unitCost: number | null })[];
  unansweredQuestions: number;
  missingCosts: number;
}

const COUNTED = new Set(["paid", "partially_refunded"]);

export async function buildReport(db: SupabaseClient, accountId: string, ownerId: string, periodDays = 7): Promise<AccountReport> {
  const now = Date.now();
  const since = new Date(now - periodDays * 86400_000);
  const prevSince = new Date(now - 2 * periodDays * 86400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  const [settingsQ, itemsQ, ordersQ, visitsQ, questionsQ] = await Promise.all([
    db.from("seller_settings").select("*").eq("owner_id", ownerId).maybeSingle(),
    db.from("items").select("*, product_costs(unit_cost, extra_cost)").eq("account_id", accountId),
    db
      .from("orders")
      .select("id, status, date_created, shipping_cost, order_items(item_id, quantity, unit_price, sale_fee)")
      .eq("account_id", accountId)
      .gte("date_created", prevSince.toISOString()),
    db.from("item_visits_daily").select("item_id, day, visits, items!inner(account_id)").eq("items.account_id", accountId).gte("day", sinceDay),
    db.from("questions").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "UNANSWERED"),
  ]);
  for (const q of [itemsQ, ordersQ, visitsQ]) if (q.error) throw q.error;

  const taxRate = Number(settingsQ.data?.tax_rate ?? 0.06);
  const items = itemsQ.data ?? [];
  const costs = new Map(
    items.map((i) => {
      const c = Array.isArray(i.product_costs) ? i.product_costs[0] : i.product_costs;
      return [i.id as string, c ? { unitCost: Number(c.unit_cost), extraCost: Number(c.extra_cost) } : undefined];
    }),
  );

  const perItem = new Map<string, { orders: number; units: number; lines: LineProfit[] }>();
  const daily = new Map<string, DayPoint>();
  for (let d = 0; d < periodDays; d++) {
    const day = new Date(since.getTime() + (d + 1) * 86400_000).toISOString().slice(0, 10);
    daily.set(day, { day, revenue: 0, profit: 0, orders: 0 });
  }
  const current: LineProfit[] = [];
  const previous: LineProfit[] = [];
  let currentOrders = 0;
  let previousOrders = 0;
  let units = 0;

  for (const o of ordersQ.data ?? []) {
    if (!COUNTED.has(o.status)) continue;
    const isCurrent = new Date(o.date_created) >= since;
    const lines = o.order_items ?? [];
    const orderTotal = lines.reduce((a, l) => a + Number(l.unit_price) * l.quantity, 0);
    if (isCurrent) currentOrders++;
    else previousOrders++;

    for (const l of lines) {
      const p = lineProfit(
        {
          orderId: o.id,
          itemId: l.item_id,
          quantity: l.quantity,
          unitPrice: Number(l.unit_price),
          saleFee: Number(l.sale_fee),
          orderShippingCost: Number(o.shipping_cost ?? 0),
          orderTotal,
        },
        costs.get(l.item_id),
        taxRate,
      );
      if (!isCurrent) {
        previous.push(p);
        continue;
      }
      current.push(p);
      units += l.quantity;
      const s = perItem.get(l.item_id) ?? { orders: 0, units: 0, lines: [] };
      s.orders++;
      s.units += l.quantity;
      s.lines.push(p);
      perItem.set(l.item_id, s);
      const dp = daily.get(o.date_created.slice(0, 10));
      if (dp) {
        dp.revenue += p.revenue;
        dp.profit += p.profit;
      }
    }
    const dp = isCurrent ? daily.get(o.date_created.slice(0, 10)) : undefined;
    if (dp) dp.orders++;
  }

  const visitsByItem = new Map<string, number>();
  for (const v of visitsQ.data ?? []) visitsByItem.set(v.item_id, (visitsByItem.get(v.item_id) ?? 0) + v.visits);

  const funnel = analyzeFunnel(
    items.map((i) => {
      const s = perItem.get(i.id);
      const hasCost = (costs.get(i.id)?.unitCost ?? 0) > 0;
      return {
        itemId: i.id,
        title: i.title,
        status: i.status,
        visits: visitsByItem.get(i.id) ?? 0,
        orders: s?.orders ?? 0,
        units: s?.units ?? 0,
        stock: i.available_quantity,
        periodDays,
        margin: s && hasCost ? sumProfits(s.lines).margin : null,
      };
    }),
    {
      lowStockDays: Number(settingsQ.data?.low_stock_days ?? 7),
      minMargin: Number(settingsQ.data?.min_margin ?? 0.1),
    },
  ).map((f) => {
    const item = items.find((i) => i.id === f.itemId)!;
    const totals = sumProfits(perItem.get(f.itemId)?.lines ?? []);
    return {
      ...f,
      revenue: totals.revenue,
      profit: totals.profit,
      price: Number(item.price),
      thumbnail: item.thumbnail,
      unitCost: costs.get(f.itemId)?.unitCost ?? null,
    };
  });

  const totals = sumProfits(current);
  const prevTotals = sumProfits(previous);
  const visits = [...visitsByItem.values()].reduce((a, b) => a + b, 0);

  return {
    periodDays,
    totals: { ...totals, orders: currentOrders, units, visits, conversion: visits > 0 ? currentOrders / visits : 0 },
    previous: { revenue: prevTotals.revenue, orders: previousOrders, profit: prevTotals.profit },
    daily: [...daily.values()],
    funnel: funnel.sort((a, b) => b.revenue - a.revenue || b.visits - a.visits),
    unansweredQuestions: questionsQ.count ?? 0,
    missingCosts: funnel.filter((f) => f.status === "active" && !(f.unitCost && f.unitCost > 0)).length,
  };
}
