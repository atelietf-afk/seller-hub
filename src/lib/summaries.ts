import "server-only";
import { generateSummary } from "./ai/summary";
import { buildReport } from "./report";
import { adminClient } from "./supabase/admin";

/** Gera e grava o resumo do dia (últimos 7 dias contra os 7 anteriores). */
export async function createDailySummary(accountId: string, ownerId: string) {
  const db = adminClient();
  const report = await buildReport(db, accountId, ownerId, 7);
  const content = await generateSummary(report);
  const day = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("daily_summaries").upsert({ account_id: accountId, day, content });
  if (error) throw error;
  return content;
}
