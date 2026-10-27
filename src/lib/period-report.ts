import "server-only";
import { generateSummary, type DailySummary } from "./ai/summary";
import { adsTotals, tacos } from "./analytics/ads";
import { computeMovers, type Mover } from "./analytics/movers";
import { periodDays, periodRange, previousPeriod, type Period } from "./analytics/periods";
import { reportExists, saveReport } from "./data/reports";
import { one } from "./db";
import { buildRangeReport, type AccountReport, type DayPoint } from "./report";

export type { Mover };

// Relatório semanal ou mensal: fotografia dos números de um período fechado,
// comparada com o período anterior, guardada para consulta e impressão.

export interface PeriodTotals {
  revenue: number;
  orders: number;
  units: number;
  avgTicket: number;
  profit: number;
  margin: number;
  fees: number;
  shipping: number;
  tax: number;
  productCost: number;
  visits: number;
  conversion: number;
  adCost: number;
  adRevenue: number;
  acos: number | null;
  tacos: number | null;
  profitAfterAds: number;
}

export interface ProductLine {
  itemId: string;
  title: string;
  thumbnail: string | null;
  revenue: number;
  units: number;
  profit: number | null; // null sem custo cadastrado
  margin: number | null;
}

export interface PeriodReportData {
  period: Period;
  previousPeriod: Period;
  nickname: string | null;
  incompleteSince: string | null; // histórico de pedidos só existe a partir desta data
  totals: PeriodTotals;
  previous: PeriodTotals;
  daily: DayPoint[];
  topProducts: ProductLine[];
  movers: { up: Mover[]; down: Mover[] };
  problems: { itemId: string; title: string; severity: "warning" | "critical"; message: string }[];
  missingCosts: number;
  unansweredQuestions: number;
}

async function adsBetween(accountId: string, start: string, end: string) {
  return (
    (await one<{ clicks: number; prints: number; cost: number; revenue: number; units: number }>(
      `select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(prints), 0)::int as prints, coalesce(sum(cost), 0) as cost,
              coalesce(sum(revenue), 0) as revenue, coalesce(sum(units), 0)::int as units
       from ads_campaign_daily where account_id = $1 and day between $2 and $3`,
      [accountId, start, end],
    )) ?? { clicks: 0, prints: 0, cost: 0, revenue: 0, units: 0 }
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

export function toTotals(r: AccountReport, ads: { cost: number; revenue: number; clicks: number; prints: number; units: number }): PeriodTotals {
  const t = r.totals;
  const a = adsTotals([ads]);
  return {
    revenue: t.revenue,
    orders: t.orders,
    units: t.units,
    avgTicket: t.orders > 0 ? round(t.revenue / t.orders) : 0,
    profit: t.profit,
    margin: t.margin,
    fees: t.fees,
    shipping: t.shipping,
    tax: t.tax,
    productCost: t.productCost,
    visits: t.visits,
    conversion: t.conversion,
    adCost: a.cost,
    adRevenue: a.revenue,
    acos: a.acos,
    tacos: tacos(a.cost, t.revenue),
    profitAfterAds: round(t.profit - a.cost),
  };
}

export async function buildPeriodReport(accountId: string, ownerId: string, period: Period): Promise<{ data: PeriodReportData; current: AccountReport; ads: Awaited<ReturnType<typeof adsBetween>> }> {
  const prevP = previousPeriod(period);
  const cur = periodRange(period);
  const prv = periodRange(prevP);
  const [current, previous, ads, prevAds, account] = await Promise.all([
    buildRangeReport(accountId, ownerId, { from: cur.from, to: cur.to, prevFrom: prv.from, periodDays: periodDays(period) }),
    buildRangeReport(accountId, ownerId, { from: prv.from, to: prv.to, prevFrom: prv.from, periodDays: periodDays(prevP) }),
    adsBetween(accountId, period.start, period.end),
    adsBetween(accountId, prevP.start, prevP.end),
    one<{ nickname: string | null; history_since: string | null }>(
      "select nickname, coalesce(orders_history_since, created_at) as history_since from ml_accounts where id = $1",
      [accountId],
    ),
  ]);

  const data: PeriodReportData = {
    period,
    previousPeriod: prevP,
    nickname: account?.nickname ?? null,
    // O histórico de pedidos ainda não chega ao início do período anterior (comparação) ou deste.
    incompleteSince: account?.history_since && new Date(account.history_since) > prv.from ? account.history_since : null,
    totals: toTotals(current, ads),
    previous: toTotals(previous, prevAds),
    daily: current.daily,
    topProducts: current.funnel
      .filter((f) => f.revenue > 0)
      .slice(0, 10)
      .map((f) => ({
        itemId: f.itemId,
        title: f.title,
        thumbnail: f.thumbnail,
        revenue: f.revenue,
        units: f.units,
        profit: f.unitCost ? f.profit : null,
        margin: f.unitCost && f.revenue > 0 ? f.profit / f.revenue : null,
      })),
    movers: computeMovers(current.funnel, previous.funnel),
    problems: current.funnel
      .flatMap((f) =>
        f.diagnoses
          .filter((d) => d.severity === "critical" || d.severity === "warning")
          .map((d) => ({ itemId: f.itemId, title: f.title, severity: d.severity as "warning" | "critical", message: d.message, rank: f.revenue })),
      )
      .sort((a, b) => (a.severity === b.severity ? b.rank - a.rank : a.severity === "critical" ? -1 : 1))
      .slice(0, 10)
      .map((x) => ({ itemId: x.itemId, title: x.title, severity: x.severity, message: x.message })),
    missingCosts: current.missingCosts,
    unansweredQuestions: current.unansweredQuestions,
  };
  return { data, current, ads };
}

/** Monta, analisa com IA e grava. A análise é opcional: sem ela o relatório sai mesmo assim. */
export async function generatePeriodReport(accountId: string, ownerId: string, period: Period) {
  const { data, current, ads } = await buildPeriodReport(accountId, ownerId, period);
  let ai: DailySummary | null = null;
  try {
    ai = await generateSummary(current, ads);
  } catch (err) {
    console.error("Análise do relatório falhou", accountId, period, err);
  }
  await saveReport(accountId, data, ai);
  return data;
}

/** Gera o semanal e o mensal fechados mais recentes que ainda não existem (rodado pelo cron diário). */
export async function ensureDueReports(accountId: string, ownerId: string, periods: Period[]) {
  const made: Period[] = [];
  for (const p of periods) {
    if (await reportExists(accountId, p.kind, p.start)) continue;
    await generatePeriodReport(accountId, ownerId, p);
    made.push(p);
  }
  return made;
}
