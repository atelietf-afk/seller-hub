import { cookies, headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkShopeeShop } from "@/lib/data/accounts";
import { query } from "@/lib/db";
import { ACCOUNT_COOKIE } from "@/lib/session";
import { ShopeeApi } from "@/lib/shopee/api";
import { shopeeConfig } from "@/lib/shopee/config";
import { tokenFromCode, type ShopeeTokenResponse } from "@/lib/shopee/oauth";
import { ShopeeShop } from "@/lib/shopee/shop";
import { syncShopee } from "@/lib/shopee/sync";
import { saveShopeeTokens } from "@/lib/shopee/tokens";

export const maxDuration = 300;

// Volta da autorização da Shopee: troca o código por tokens e cadastra a loja.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (msg: string) => {
    console.warn("Conexão com a Shopee não concluída:", msg);
    return NextResponse.redirect(new URL(`/configuracoes?ml=${msg}`, request.url));
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const jar = await cookies();
  const expected = jar.get("shopee_oauth_state")?.value;
  jar.delete({ name: "shopee_oauth_state", path: "/api/shopee/callback" });
  const code = url.searchParams.get("code");
  const shopId = Number(url.searchParams.get("shop_id"));
  if (!expected || url.searchParams.get("state") !== expected) return back("estado-invalido");
  if (!code || !Number.isFinite(shopId) || shopId <= 0) return back("autorizacao-negada");

  const cfg = shopeeConfig();
  let tokens: ShopeeTokenResponse;
  try {
    tokens = await tokenFromCode(cfg, code, shopId);
  } catch (err) {
    console.error("Troca do código da Shopee falhou", err);
    return back("codigo-invalido");
  }
  const info = await new ShopeeShop(new ShopeeApi(cfg, shopId, async () => tokens.access_token)).shopInfo().catch(() => null);

  const account = await linkShopeeShop(session.user.id, { id: shopId, name: info?.shop_name ?? null });
  if (!account) return back("conta-ja-vinculada");
  await saveShopeeTokens(account.id, tokens);
  await query("insert into seller_settings (owner_id) values ($1) on conflict do nothing", [session.user.id]);
  // A loja recém-conectada vira a conta ativa.
  jar.set(ACCOUNT_COOKIE, account.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });

  console.info("Loja da Shopee conectada", account.id, shopId, info?.shop_name ?? "");
  after(() => syncShopee(account.id).catch((err) => console.error("Primeira sincronização da Shopee falhou", err)));
  return NextResponse.redirect(new URL("/dashboard?conectado=1", request.url));
}
