import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { authorizationUrl } from "@/lib/ml/oauth";
import { createClient } from "@/lib/supabase/server";

// Inicia a conexão: manda o vendedor para a tela de autorização do Mercado Livre.
export async function GET(request: Request) {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("ml_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/ml/callback",
  });
  return NextResponse.redirect(
    authorizationUrl({ clientId: env("ML_CLIENT_ID"), redirectUri: env("ML_REDIRECT_URI"), state }),
  );
}
