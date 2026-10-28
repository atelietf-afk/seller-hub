import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { one, pool, query } from "@/lib/db";
import { SpApi } from "./api";
import { amazonConfig } from "./config";
import { refreshAmazonToken, type LwaTokenResponse } from "./lwa";

// Mesmo esquema dos outros marketplaces: tokens criptografados e renovação serializada por conta.

const SKEW_MS = 5 * 60 * 1000;

interface TokenRow {
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
}

const isFresh = (row: TokenRow) => !!row.access_token && !!row.expires_at && new Date(row.expires_at).getTime() - SKEW_MS > Date.now();
const expiry = (t: LwaTokenResponse) => new Date(Date.now() + t.expires_in * 1000).toISOString();

export async function saveAmazonTokens(accountId: string, t: LwaTokenResponse) {
  if (!t.refresh_token) throw new Error("Amazon não devolveu o token de renovação");
  await query(
    `insert into amazon_tokens (account_id, access_token, refresh_token, expires_at) values ($1, $2, $3, $4)
     on conflict (account_id) do update set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at, updated_at = now()`,
    [accountId, encrypt(t.access_token), encrypt(t.refresh_token), expiry(t)],
  );
}

export async function validAmazonToken(accountId: string): Promise<string> {
  const row = await one<TokenRow>("select access_token, refresh_token, expires_at from amazon_tokens where account_id = $1", [accountId]);
  if (!row) throw new Error(`Conta ${accountId} sem tokens da Amazon`);
  if (isFresh(row)) return decrypt(row.access_token!);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('amazon_token:' || $1))", [accountId]);
    const current = (
      await client.query<TokenRow>("select access_token, refresh_token, expires_at from amazon_tokens where account_id = $1", [accountId])
    ).rows[0];
    if (isFresh(current)) {
      await client.query("commit");
      return decrypt(current.access_token!);
    }
    const fresh = await refreshAmazonToken(amazonConfig(), decrypt(current.refresh_token));
    // A Amazon normalmente mantém o mesmo token de renovação; se mandar outro, guarda o novo.
    await client.query(
      `update amazon_tokens set access_token = $2, refresh_token = coalesce($3, refresh_token), expires_at = $4, updated_at = now()
       where account_id = $1`,
      [accountId, encrypt(fresh.access_token), fresh.refresh_token ? encrypt(fresh.refresh_token) : null, expiry(fresh)],
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

export function amazonApiFor(accountId: string) {
  let cached: Promise<string> | undefined;
  return new SpApi(amazonConfig().apiHost, () => (cached ??= validAmazonToken(accountId)));
}
