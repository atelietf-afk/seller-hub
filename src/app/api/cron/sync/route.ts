import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { syncAnyAccount } from "@/lib/sync";
import { allAccounts } from "@/lib/data/accounts";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const accounts = await allAccounts();
  const results: Record<string, unknown> = {};
  for (const a of accounts) {
    try {
      results[a.id] = await syncAnyAccount(a);
    } catch (err) {
      results[a.id] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json({ ok: true, results });
}
