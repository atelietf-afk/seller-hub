import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { accountsOfOwners, recentEvents } from "@/lib/data/accounts";
import { membershipsOf } from "@/lib/data/team";

// Eventos novos da central ao vivo (o painel consulta a cada poucos segundos).
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account");
  const after = url.searchParams.get("after") ?? undefined;
  // Contas do próprio usuário e dos espaços em que ele é da equipe.
  const owners = [session.user.id, ...(await membershipsOf(session.user.id)).map((m) => m.owner_id)];
  const owned = (await accountsOfOwners(owners)).some((a) => a.id === accountId);
  if (!accountId || !owned) return NextResponse.json({ error: "conta inválida" }, { status: 404 });

  return NextResponse.json({ events: await recentEvents(accountId, after) }, { headers: { "Cache-Control": "no-store" } });
}
