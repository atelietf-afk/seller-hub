import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAccount } from "@/lib/ml/sync";
import { createDailySummary } from "@/lib/summaries";
import { allAccounts } from "@/lib/data/accounts";

export const maxDuration = 300;

// Todo dia de manhã: sincroniza e escreve o resumo de cada conta.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const accounts = await allAccounts();
  const results: Record<string, string> = {};
  for (const a of accounts) {
    try {
      await syncAccount(a.id);
      await createDailySummary(a.id, a.owner_id);
      results[a.id] = "ok";
    } catch (err) {
      results[a.id] = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ ok: true, results });
}
