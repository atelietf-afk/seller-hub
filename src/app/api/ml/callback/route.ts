import { cookies, headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkAccount } from "@/lib/data/accounts";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { MlApi } from "@/lib/ml/api";
import { callbackProblem, exchangeCode, hasRefreshToken } from "@/lib/ml/oauth";
import type { MlTokenResponse } from "@/lib/ml/types";
import { syncAccount } from "@/lib/ml/sync";
import { saveTokens } from "@/lib/ml/tokens";

export const maxDuration = 300;

// Volta da autorização do ML: troca o código por tokens e cadastra a conta.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (msg: string) => {
    console.warn("Conexão com o ML não concluída:", msg);
    return NextResponse.redirect(new URL(`/configuracoes?ml=${msg}`, request.url));
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const jar = await cookies();
  const expected = jar.get("ml_oauth_state")?.value;
  jar.delete({ name: "ml_oauth_state", path: "/api/ml/callback" });
  const problem = callbackProblem(url.searchParams, expected);
  if (problem) return back(problem);

  let tokens: MlTokenResponse;
  try {
    tokens = await exchangeCode({
      clientId: env("ML_CLIENT_ID"),
      clientSecret: env("ML_CLIENT_SECRET"),
      redirectUri: env("ML_REDIRECT_URI"),
      code: url.searchParams.get("code")!,
    });
  } catch (err) {
    // Código vencido ou já usado (ex.: a página foi recarregada), ou credenciais erradas.
    console.error("Troca do código do ML falhou", err);
    return back("codigo-invalido");
  }
  // Valida antes de cadastrar a conta, para não deixar conta sem tokens.
  if (!hasRefreshToken(tokens)) return back("sem-acesso-offline");
  const me = await new MlApi(async () => tokens.access_token).me();

  const account = await linkAccount(session.user.id, {
    id: me.id,
    nickname: me.nickname,
    site_id: me.site_id,
    reputation: me.seller_reputation ?? null,
  });
  if (!account) return back("conta-ja-vinculada");
  await saveTokens(account.id, tokens);
  await query("insert into seller_settings (owner_id) values ($1) on conflict do nothing", [session.user.id]);

  // Primeira sincronização roda depois de responder, para o vendedor não esperar.
  // O scope mostra o que o ML de fato concedeu (ex.: escrita de publicidade); não é segredo.
  console.info("Conta do ML conectada", account.id, me.nickname, `scope: ${tokens.scope ?? "(não informado)"}`);
  after(() => syncAccount(account.id).catch((err) => console.error("Primeira sincronização falhou", err)));
  return NextResponse.redirect(new URL("/dashboard?conectado=1", request.url));
}
