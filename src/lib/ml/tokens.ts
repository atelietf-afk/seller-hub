import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { MlApi } from "./api";
import { refreshTokens } from "./oauth";
import type { MlTokenResponse } from "./types";

// Renova com 5 minutos de folga antes de expirar.
const SKEW_MS = 5 * 60 * 1000;

export async function saveTokens(accountId: string, t: MlTokenResponse) {
  const { error } = await adminClient()
    .from("ml_tokens")
    .upsert({
      account_id: accountId,
      access_token: encrypt(t.access_token),
      refresh_token: encrypt(t.refresh_token),
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/**
 * Devolve um access token válido, renovando quando preciso.
 * O ML invalida o refresh token a cada uso; se duas execuções renovarem ao mesmo
 * tempo, só uma grava (a condição em updated_at) e a outra relê o token novo.
 */
export async function validAccessToken(accountId: string): Promise<string> {
  const db = adminClient();
  const { data: row, error } = await db.from("ml_tokens").select("*").eq("account_id", accountId).single();
  if (error || !row) throw new Error(`Conta ${accountId} sem tokens do Mercado Livre`);

  if (new Date(row.expires_at).getTime() - SKEW_MS > Date.now()) return decrypt(row.access_token);

  const fresh = await refreshTokens({
    clientId: env("ML_CLIENT_ID"),
    clientSecret: env("ML_CLIENT_SECRET"),
    refreshToken: decrypt(row.refresh_token),
  }).catch(async (err) => {
    // Outra execução pode ter renovado primeiro e gastado este refresh token.
    const { data: again } = await db.from("ml_tokens").select("*").eq("account_id", accountId).single();
    if (again && again.updated_at !== row.updated_at) return null;
    throw err;
  });
  if (!fresh) return validAccessToken(accountId);

  const { data: updated } = await db
    .from("ml_tokens")
    .update({
      access_token: encrypt(fresh.access_token),
      refresh_token: encrypt(fresh.refresh_token),
      expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .eq("updated_at", row.updated_at)
    .select("account_id");
  if (!updated?.length) return validAccessToken(accountId);
  return fresh.access_token;
}

export function apiFor(accountId: string) {
  let cached: Promise<string> | undefined;
  return new MlApi(() => (cached ??= validAccessToken(accountId)));
}
