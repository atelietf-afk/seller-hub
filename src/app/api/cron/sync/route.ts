import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAccount } from "@/lib/ml/sync";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: accounts } = await adminClient().from("ml_accounts").select("id");
  const results: Record<string, unknown> = {};
  for (const a of accounts ?? []) {
    try {
      results[a.id] = await syncAccount(a.id);
    } catch (err) {
      results[a.id] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json({ ok: true, results });
}
