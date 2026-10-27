import { lineProfit, sumProfits, type LineProfit } from "./profit";
import { localDay, localMidnight } from "./periods";

// Vendas do dia (horário de Brasília) comparadas com ontem até o mesmo horário.

export interface SaleLine {
  item_id: string;
  title: string;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  sale_fee: number;
  unit_cost: number | null;
  extra_cost: number | null;
}

export interface SaleOrder {
  id: number;
  status: string;
  date_created: string;
  shipping_cost: number | null;
  lines: SaleLine[];
}

export interface DayTotals {
  revenue: number;
  orders: number;
  units: number;
  profit: number;
  margin: number;
  avgTicket: number;
  hasCost: boolean; // false se algum produto vendido está sem custo (lucro superestimado)
}

export interface TodayOrder {
  id: number;
  time: string; // ISO
  status: string;
  counted: boolean; // entra nos totais (pago)
  revenue: number;
  profit: number;
  hasCost: boolean;
  units: number;
  lines: { itemId: string; title: string; thumbnail: string | null; quantity: number }[];
}

export interface TodaySales {
  day: string; // AAAA-MM-DD
  today: DayTotals;
  /** Ontem, de 0h até o mesmo horário de agora. */
  yesterday: DayTotals;
  /** Pedidos de hoje, do mais novo para o mais antigo (inclui cancelados e não pagos, fora dos totais). */
  orders: TodayOrder[];
}

const COUNTED = new Set(["paid", "partially_refunded"]);
const DAY = 86_400_000;

function orderProfit(o: SaleOrder, taxRate: number): LineProfit {
  const orderTotal = o.lines.reduce((a, l) => a + l.unit_price * l.quantity, 0);
  return sumProfits(
    o.lines.map((l) =>
      lineProfit(
        {
          orderId: o.id,
          itemId: l.item_id,
          quantity: l.quantity,
          unitPrice: l.unit_price,
          saleFee: l.sale_fee,
          orderShippingCost: o.shipping_cost ?? 0,
          orderTotal,
        },
        l.unit_cost != null ? { unitCost: l.unit_cost, extraCost: l.extra_cost ?? 0 } : undefined,
        taxRate,
      ),
    ),
  );
}

function totals(orders: { p: LineProfit; units: number }[]): DayTotals {
  const t = sumProfits(orders.map((o) => o.p));
  return {
    revenue: t.revenue,
    orders: orders.length,
    units: orders.reduce((a, o) => a + o.units, 0),
    profit: t.profit,
    margin: t.margin,
    avgTicket: orders.length ? Math.round((t.revenue / orders.length) * 100) / 100 : 0,
    hasCost: orders.length === 0 || t.hasCost,
  };
}

/** Janela que a consulta precisa cobrir: de 0h de ontem até agora. */
export function todayWindow(now: Date) {
  const todayStart = localMidnight(localDay(now));
  return { from: new Date(todayStart.getTime() - DAY), todayStart, to: now };
}

export function todaySales(orders: SaleOrder[], taxRate: number, now: Date): TodaySales {
  const { from: yesterdayStart, todayStart } = todayWindow(now);
  const sameTimeYesterday = now.getTime() - DAY;
  const today: { p: LineProfit; units: number }[] = [];
  const yesterday: { p: LineProfit; units: number }[] = [];
  const list: TodayOrder[] = [];

  for (const o of orders) {
    const t = new Date(o.date_created).getTime();
    const p = orderProfit(o, taxRate);
    const units = o.lines.reduce((a, l) => a + l.quantity, 0);
    const counted = COUNTED.has(o.status);
    if (t >= todayStart.getTime() && t <= now.getTime()) {
      if (counted) today.push({ p, units });
      list.push({
        id: o.id,
        time: o.date_created,
        status: o.status,
        counted,
        revenue: p.revenue,
        profit: p.profit,
        hasCost: p.hasCost,
        units,
        lines: o.lines.map((l) => ({ itemId: l.item_id, title: l.title, thumbnail: l.thumbnail, quantity: l.quantity })),
      });
    } else if (counted && t >= yesterdayStart.getTime() && t <= sameTimeYesterday) {
      yesterday.push({ p, units });
    }
  }

  list.sort((a, b) => b.time.localeCompare(a.time));
  return { day: localDay(now), today: totals(today), yesterday: totals(yesterday), orders: list };
}
