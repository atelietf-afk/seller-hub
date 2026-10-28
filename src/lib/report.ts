import "server-only";
import { analyzeFunnel, type ItemFunnel } from "./analytics/funnel";
import { localDay } from "./analytics/periods";
import { lineProfit, sumProfits, type LineProfit } from "./analytics/profit";
import { settingsOf } from "./data/accounts";
import { one, query } from "./db";

// Monta os números da conta num período, para as telas e para a IA.

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

interface ItemRow {
  id: string;
  title: string;
  status: string;
  price: number;
  available_quantity: number;
  thumbnail: string | null;
  unit_cost: number | null;
  extra_cost: number | null;
}

interface OrderRow {
  id: string;
  status: string;
  date_created: string;
  shipping_cost: number | null;
  order_items: { item_id: string; quantity: number; unit_price: number; sale_fee: number }[];
}

/** Últimos N dias até agora, contra os N dias anteriores. O chamador garante que a conta é do usuário. */
export async function buildReport(accountId: string, ownerId: string, periodDays = 7): Promise<AccountReport> {
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 86400_000);
  return buildRangeReport(accountId, ownerId, { from, to, prevFrom: new Date(from.getTime() - periodDays * 86400_000), periodDays });
}

/**
 * Números de [from, to) contra [prevFrom, from). Os dias do gráfico seguem o horário
 * de Brasília. O chamador garante que a conta é do usuário (ou que é uma rotina interna).
 */
export async function buildRangeReport(
  accountId: string,
  ownerId: string,
  range: { from: Date; to: Date; prevFrom: Date; periodDays: number },
): Promise<AccountReport> {
  const { from: since, to, prevFrom: prevSince, periodDays } = range;
  const sinceDay = localDay(since);
  const toDay = localDay(new Date(to.getTime() - 1));

  const [settings, items, orders, visits, questions] = await Promise.all([
    settingsOf(ownerId),
    query<ItemRow>(
      `select i.id, i.title, i.status, i.price, i.available_quantity, i.thumbnail, c.unit_cost, c.extra_cost
       from items i left join product_costs c on c.item_id = i.id where i.account_id = $1`,
      [accountId],
    ),
    query<OrderRow>(
      `select o.id, o.status, o.date_created, o.shipping_cost,
         coalesce(json_agg(json_build_object('item_id', oi.item_id, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
           'sale_fee', oi.sale_fee)) filter (where oi.order_id is not null), '[]') as order_items
       from orders o left join order_items oi on oi.order_id = o.id
       where o.account_id = $1 and o.date_created >= $2 and o.date_created < $3 group by o.id`,
      [accountId, prevSince.toISOString(), to.toISOString()],
    ),
    query<{ item_id: string; visits: number }>(
      `select v.item_id, sum(v.visits)::int as visits from item_visits_daily v join items i on i.id = v.item_id
       where i.account_id = $1 and v.day >= $2 and v.day <= $3 group by v.item_id`,
      [accountId, sinceDay, toDay],
    ),
    one<{ n: number }>("select count(*)::int as n from questions where account_id = $1 and status = 'UNANSWERED'", [accountId]),
  ]);

  const taxRate = settings.tax_rate;
  const costs = new Map(
    items.map((i) => [i.id, i.unit_cost != null ? { unitCost: i.unit_cost, extraCost: i.extra_cost ?? 0 } : undefined]),
  );

  const perItem = new Map<string, { orders: number; units: number; lines: LineProfit[] }>();
  const daily = new Map<string, DayPoint>();
  const lastInstant = to.getTime() - 1;
  for (let d = periodDays - 1; d >= 0; d--) {
    const day = localDay(lastInstant - d * 86400_000);
    daily.set(day, { day, revenue: 0, profit: 0, orders: 0 });
  }
  const current: LineProfit[] = [];
  const previous: LineProfit[] = [];
  let currentOrders = 0;
  let previousOrders = 0;
  let units = 0;

  for (const o of orders) {
    if (!COUNTED.has(o.status)) continue;
    const isCurrent = new Date(o.date_created) >= since;
    const lines = o.order_items;
    const orderTotal = lines.reduce((a, l) => a + l.unit_price * l.quantity, 0);
    if (isCurrent) currentOrders++;
    else previousOrders++;

    for (const l of lines) {
      const p = lineProfit(
        {
          orderId: o.id,
          itemId: l.item_id,
          quantity: l.quantity,
          unitPrice: l.unit_price,
          saleFee: l.sale_fee,
          orderShippingCost: o.shipping_cost ?? 0,
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
      const dp = daily.get(localDay(o.date_created));
      if (dp) {
        dp.revenue += p.revenue;
        dp.profit += p.profit;
      }
    }
    const dp = isCurrent ? daily.get(localDay(o.date_created)) : undefined;
    if (dp) dp.orders++;
  }

  const visitsByItem = new Map<string, number>();
  for (const v of visits) visitsByItem.set(v.item_id, (visitsByItem.get(v.item_id) ?? 0) + v.visits);

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
    { lowStockDays: settings.low_stock_days, minMargin: settings.min_margin },
  ).map((f) => {
    const item = items.find((i) => i.id === f.itemId)!;
    const totals = sumProfits(perItem.get(f.itemId)?.lines ?? []);
    return {
      ...f,
      revenue: totals.revenue,
      profit: totals.profit,
      price: item.price,
      thumbnail: item.thumbnail,
      unitCost: costs.get(f.itemId)?.unitCost ?? null,
    };
  });

  const totals = sumProfits(current);
  const prevTotals = sumProfits(previous);
  const totalVisits = [...visitsByItem.values()].reduce((a, b) => a + b, 0);

  return {
    periodDays,
    totals: { ...totals, orders: currentOrders, units, visits: totalVisits, conversion: totalVisits > 0 ? currentOrders / totalVisits : 0 },
    previous: { revenue: prevTotals.revenue, orders: previousOrders, profit: prevTotals.profit },
    daily: [...daily.values()],
    funnel: funnel.sort((a, b) => b.revenue - a.revenue || b.visits - a.visits),
    unansweredQuestions: questions?.n ?? 0,
    missingCosts: funnel.filter((f) => f.status === "active" && !(f.unitCost && f.unitCost > 0)).length,
  };
}
