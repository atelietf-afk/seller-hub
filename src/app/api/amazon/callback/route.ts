import { cookies, headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { SpApi } from "@/lib/amazon/api";
import { amazonConfig } from "@/lib/amazon/config";
import { tokenFromCode, type LwaTokenResponse } from "@/lib/amazon/lwa";
import { AmazonSeller } from "@/lib/amazon/seller";
import { syncAmazon } from "@/lib/amazon/sync";
import { saveAmazonTokens } from "@/lib/amazon/tokens";
import { auth } from "@/lib/auth";
import { linkAmazonSeller } from "@/lib/data/accounts";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { ACCOUNT_COOKIE } from "@/lib/session";

export const maxDuration = 300;

// Volta da autorização da Amazon: troca o código por tokens e cadastra a conta.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (msg: string) => {
    console.warn("Conexão com a Amazon não concluída:", msg);
    return NextResponse.redirect(new URL(`/configuracoes?ml=${msg}`, request.url));
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const jar = await cookies();
  const expected = jar.get("amazon_oauth_state")?.value;
  jar.delete({ name: "amazon_oauth_state", path: "/api/amazon/callback" });
  const code = url.searchParams.get("spapi_oauth_code");
  const sellerId = url.searchParams.get("selling_partner_id");
  if (!expected || url.searchParams.get("state") !== expected) return back("estado-invalido");
  if (!code || !sellerId) return back("autorizacao-negada");

  const cfg = amazonConfig();
  let tokens: LwaTokenResponse;
  try {
    tokens = await tokenFromCode(cfg, code, new URL("/api/amazon/callback", env("BETTER_AUTH_URL")).toString());
  } catch (err) {
    console.error("Troca do código da Amazon falhou", err);
    return back("codigo-invalido");
  }
  const name = await new AmazonSeller(new SpApi(cfg.apiHost, async () => tokens.access_token), cfg.marketplaceId)
    .storeName()
    .catch(() => null);

  const account = await linkAmazonSeller(session.user.id, { id: sellerId, name });
  if (!account) return back("conta-ja-vinculada");
  await saveAmazonTokens(account.id, tokens);
  await query("insert into seller_settings (owner_id) values ($1) on conflict do nothing", [session.user.id]);
  jar.set(ACCOUNT_COOKIE, account.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });

  console.info("Conta da Amazon conectada", account.id, sellerId, name ?? "");
  after(() => syncAmazon(account.id).catch((err) => console.error("Primeira sincronização da Amazon falhou", err)));
  return NextResponse.redirect(new URL("/dashboard?conectado=1", request.url));
}
