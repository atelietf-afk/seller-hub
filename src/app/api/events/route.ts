import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { accountsOf, recentEvents } from "@/lib/data/accounts";

// Eventos novos da central ao vivo (o painel consulta a cada poucos segundos).
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account");
  const after = url.searchParams.get("after") ?? undefined;
  const owned = (await accountsOf(session.user.id)).some((a) => a.id === accountId);
  if (!accountId || !owned) return NextResponse.json({ error: "conta inválida" }, { status: 404 });

  return NextResponse.json({ events: await recentEvents(accountId, after) }, { headers: { "Cache-Control": "no-store" } });
}
