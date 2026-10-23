import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAccount } from "@/lib/ml/sync";
import { createDailySummary } from "@/lib/summaries";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Todo dia de manhã: sincroniza e escreve o resumo de cada conta.
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: accounts } = await adminClient().from("ml_accounts").select("id, owner_id");
  const results: Record<string, string> = {};
  for (const a of accounts ?? []) {
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
