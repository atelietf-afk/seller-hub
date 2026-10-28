import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { shopeeConfig, shopeeConfigured } from "@/lib/shopee/config";
import { shopeeAuthUrl } from "@/lib/shopee/sign";

// Inicia a conexão: manda o vendedor para a tela de autorização da Shopee.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!shopeeConfigured()) return NextResponse.redirect(new URL("/configuracoes?ml=shopee-desligada", request.url));

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("shopee_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/shopee/callback",
  });
  // A Shopee devolve para este endereço acrescentando code e shop_id.
  const redirect = new URL("/api/shopee/callback", env("BETTER_AUTH_URL"));
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(shopeeAuthUrl({ ...shopeeConfig(), redirect: redirect.toString(), timestamp: Math.floor(Date.now() / 1000) }));
}
