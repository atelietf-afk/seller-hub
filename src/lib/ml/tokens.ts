import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { one, pool, query } from "@/lib/db";
import { env } from "@/lib/env";
import { MlApi } from "./api";
import { refreshTokens } from "./oauth";
import type { MlTokenResponse } from "./types";

// Renova com 5 minutos de folga antes de expirar.
const SKEW_MS = 5 * 60 * 1000;

interface TokenRow {
  access_token: string;
  refresh_token?: string;
  expires_at: string;
}

const isFresh = (row: TokenRow) => new Date(row.expires_at).getTime() - SKEW_MS > Date.now();

const expiry = (t: MlTokenResponse) => new Date(Date.now() + t.expires_in * 1000).toISOString();

export async function saveTokens(accountId: string, t: MlTokenResponse) {
  await query(
    `insert into ml_tokens (account_id, access_token, refresh_token, expires_at) values ($1, $2, $3, $4)
     on conflict (account_id) do update set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at, updated_at = now()`,
    [accountId, encrypt(t.access_token), encrypt(t.refresh_token), expiry(t)],
  );
}

/**
 * Devolve um access token válido, renovando quando preciso.
 * O ML invalida o refresh token a cada uso, então a renovação é serializada por
 * conta com um advisory lock do Postgres: quem chega depois espera e lê o token novo.
 */
export async function validAccessToken(accountId: string): Promise<string> {
  const row = await one<TokenRow>("select access_token, expires_at from ml_tokens where account_id = $1", [accountId]);
  if (!row) throw new Error(`Conta ${accountId} sem tokens do Mercado Livre`);
  if (isFresh(row)) return decrypt(row.access_token);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('ml_token:' || $1))", [accountId]);
    const current = (
      await client.query<Required<TokenRow>>("select access_token, refresh_token, expires_at from ml_tokens where account_id = $1", [accountId])
    ).rows[0];
    if (isFresh(current)) {
      await client.query("commit");
      return decrypt(current.access_token);
    }
    const fresh = await refreshTokens({
      clientId: env("ML_CLIENT_ID"),
      clientSecret: env("ML_CLIENT_SECRET"),
      refreshToken: decrypt(current.refresh_token),
    });
    await client.query(
      "update ml_tokens set access_token = $2, refresh_token = $3, expires_at = $4, updated_at = now() where account_id = $1",
      [accountId, encrypt(fresh.access_token), encrypt(fresh.refresh_token), expiry(fresh)],
    );
    await client.query("commit");
    return fresh.access_token;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function apiFor(accountId: string) {
  let cached: Promise<string> | undefined;
  return new MlApi(() => (cached ??= validAccessToken(accountId)));
}
