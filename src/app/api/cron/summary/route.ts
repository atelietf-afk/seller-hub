import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAccount } from "@/lib/ml/sync";
import { lastCompleteMonth, lastCompleteWeek } from "@/lib/analytics/periods";
import { ensureDueReports } from "@/lib/period-report";
import { deliverPendingReports } from "@/lib/report-delivery";
import { createDailySummary } from "@/lib/summaries";
import { allAccounts } from "@/lib/data/accounts";

export const maxDuration = 300;

// Todo dia de manhã: sincroniza, escreve o resumo de cada conta, gera os relatórios que fecharam
// e manda no WhatsApp os que ainda não foram.
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
      const sent = await deliverPendingReports(a.id, a.owner_id);
      results[a.id] = [
        "ok",
        made.length ? `relatórios: ${made.map((p) => `${p.kind} ${p.start}`).join(", ")}` : "",
        Object.keys(sent).length ? `whatsapp: ${JSON.stringify(sent)}` : "",
      ]
        .filter(Boolean)
        .join(", ");
    } catch (err) {
      results[a.id] = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ ok: true, results });
}
