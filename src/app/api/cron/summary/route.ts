import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAccount } from "@/lib/ml/sync";
import { lastCompleteMonth, lastCompleteWeek } from "@/lib/analytics/periods";
import { ensureDueReports } from "@/lib/period-report";
import { createDailySummary } from "@/lib/summaries";
import { allAccounts } from "@/lib/data/accounts";

export const maxDuration = 300;

// Todo dia de manhã: sincroniza, escreve o resumo de cada conta e gera os relatórios que fecharam.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const accounts = await allAccounts();
  const results: Record<string, string> = {};
  for (const a of accounts) {
    try {
      await syncAccount(a.id);
      await createDailySummary(a.id, a.owner_id);
      // Segunda-feira sai o semanal; dia 1, o mensal (e qualquer um que tenha faltado).
      const now = new Date();
      const made = await ensureDueReports(a.id, a.owner_id, [lastCompleteWeek(now), lastCompleteMonth(now)]);
      results[a.id] = made.length ? `ok, relatórios: ${made.map((p) => `${p.kind} ${p.start}`).join(", ")}` : "ok";
    } catch (err) {
      results[a.id] = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ ok: true, results });
}
