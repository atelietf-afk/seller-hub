import "server-only";
import { generateSummary } from "./ai/summary";
import { saveSummary } from "./data/accounts";
import { buildReport } from "./report";

/** Gera e grava o resumo do dia (últimos 7 dias contra os 7 anteriores). */
export async function createDailySummary(accountId: string, ownerId: string) {
  const report = await buildReport(accountId, ownerId, 7);
  const content = await generateSummary(report);
  await saveSummary(accountId, new Date().toISOString().slice(0, 10), content);
  return content;
}
