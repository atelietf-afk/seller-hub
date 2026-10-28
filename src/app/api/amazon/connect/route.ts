import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { amazonConfig, amazonConfigured } from "@/lib/amazon/config";
import { amazonConsentUrl } from "@/lib/amazon/lwa";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

// Inicia a conexão: manda o vendedor para a tela de autorização na Central do Vendedor.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!amazonConfigured()) return NextResponse.redirect(new URL("/configuracoes?ml=amazon-desligada", request.url));

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("amazon_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/amazon/callback",
  });
  const redirect = new URL("/api/amazon/callback", env("BETTER_AUTH_URL")).toString();
  return NextResponse.redirect(amazonConsentUrl(amazonConfig(), state, redirect));
}
