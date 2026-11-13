import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { query } from "@/lib/db";
import { boostShopeeItems } from "@/lib/shopee/boost";

export const maxDuration = 120;

// Impulsionamento automático das lojas Shopee. Chamado a cada 4 horas por um agendador externo
// com "Authorization: Bearer <CRON_SECRET>" (o plano Hobby da Vercel só agenda uma vez por dia).
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const accounts = await query<{ id: string }>("select id from ml_accounts where marketplace = 'shopee' and ml_user_id is not null");
  const results: Record<string, unknown> = {};
  for (const a of accounts) {
    try {
      results[a.id] = await boostShopeeItems(a.id);
    } catch (err) {
      results[a.id] = err instanceof Error ? err.message : String(err);
    }
  }
  return NextResponse.json({ ok: true, results });
}
