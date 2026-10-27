import "server-only";
import { generateSummary } from "./ai/summary";
import { saveSummary } from "./data/accounts";
import { one } from "./db";
import { buildReport } from "./report";

/** Gera e grava o resumo do dia (últimos 7 dias contra os 7 anteriores). */
export async function createDailySummary(accountId: string, ownerId: string) {
  const report = await buildReport(accountId, ownerId, 7);
  const ads = await one<{ clicks: number; prints: number; cost: number; revenue: number; units: number }>(
    `select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(prints), 0)::int as prints, coalesce(sum(cost), 0) as cost,
            coalesce(sum(revenue), 0) as revenue, coalesce(sum(units), 0)::int as units
     from ads_campaign_daily where account_id = $1 and day > current_date - 7`,
    [accountId],
  );
  const content = await generateSummary(report, ads);
  await saveSummary(accountId, new Date().toISOString().slice(0, 10), content);
  return content;
}
