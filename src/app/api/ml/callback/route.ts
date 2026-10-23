import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { MlApi } from "@/lib/ml/api";
import { exchangeCode } from "@/lib/ml/oauth";
import { syncAccount } from "@/lib/ml/sync";
import { saveTokens } from "@/lib/ml/tokens";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Volta da autorização do ML: troca o código por tokens e cadastra a conta.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (msg: string) => NextResponse.redirect(new URL(`/configuracoes?ml=${msg}`, request.url));

  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));

  const jar = await cookies();
  const expected = jar.get("ml_oauth_state")?.value;
  jar.delete({ name: "ml_oauth_state", path: "/api/ml/callback" });
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("estado-invalido");

  const tokens = await exchangeCode({
    clientId: env("ML_CLIENT_ID"),
    clientSecret: env("ML_CLIENT_SECRET"),
    redirectUri: env("ML_REDIRECT_URI"),
    code,
  });
  const me = await new MlApi(async () => tokens.access_token).me();

  const admin = adminClient();
  const { data: existing } = await admin.from("ml_accounts").select("id, owner_id").eq("ml_user_id", me.id).maybeSingle();
  if (existing && existing.owner_id !== data.user.id) return back("conta-ja-vinculada");

  const { data: account, error } = await admin
    .from("ml_accounts")
    .upsert(
      { owner_id: data.user.id, ml_user_id: me.id, nickname: me.nickname, site_id: me.site_id, reputation: me.seller_reputation ?? null },
      { onConflict: "ml_user_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  await saveTokens(account.id, tokens);
  await admin.from("seller_settings").upsert({ owner_id: data.user.id }, { onConflict: "owner_id", ignoreDuplicates: true });

  // Primeira sincronização roda depois de responder, para o vendedor não esperar.
  after(() => syncAccount(account.id).catch((err) => console.error("Primeira sincronização falhou", err)));
  return NextResponse.redirect(new URL("/dashboard?conectado=1", request.url));
}
