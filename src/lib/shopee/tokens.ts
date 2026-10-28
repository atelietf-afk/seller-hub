import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { one, pool, query } from "@/lib/db";
import { ShopeeApi } from "./api";
import { shopeeConfig } from "./config";
import { refreshShopeeToken, type ShopeeTokenResponse } from "./oauth";

// Mesmo esquema dos tokens do ML: criptografados e renovação serializada por conta.

const SKEW_MS = 5 * 60 * 1000;
const REFRESH_DAYS = 30;

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

const isFresh = (row: { expires_at: string }) => new Date(row.expires_at).getTime() - SKEW_MS > Date.now();
const expiry = (t: ShopeeTokenResponse) => new Date(Date.now() + t.expire_in * 1000).toISOString();
const refreshExpiry = () => new Date(Date.now() + REFRESH_DAYS * 86_400_000).toISOString();

export async function saveShopeeTokens(accountId: string, t: ShopeeTokenResponse) {
  await query(
    `insert into shopee_tokens (account_id, access_token, refresh_token, expires_at, refresh_expires_at) values ($1, $2, $3, $4, $5)
     on conflict (account_id) do update set access_token = excluded.access_token, refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at, refresh_expires_at = excluded.refresh_expires_at, updated_at = now()`,
    [accountId, encrypt(t.access_token), encrypt(t.refresh_token), expiry(t), refreshExpiry()],
  );
}

export async function validShopeeToken(accountId: string, shopId: number): Promise<string> {
  const row = await one<TokenRow>("select access_token, refresh_token, expires_at from shopee_tokens where account_id = $1", [accountId]);
  if (!row) throw new Error(`Conta ${accountId} sem tokens da Shopee`);
  if (isFresh(row)) return decrypt(row.access_token);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('shopee_token:' || $1))", [accountId]);
    const current = (await client.query<TokenRow>("select access_token, refresh_token, expires_at from shopee_tokens where account_id = $1", [accountId]))
      .rows[0];
    if (isFresh(current)) {
      await client.query("commit");
      return decrypt(current.access_token);
    }
    const fresh = await refreshShopeeToken(shopeeConfig(), decrypt(current.refresh_token), shopId);
    await client.query(
      `update shopee_tokens set access_token = $2, refresh_token = $3, expires_at = $4, refresh_expires_at = $5, updated_at = now()
       where account_id = $1`,
      [accountId, encrypt(fresh.access_token), encrypt(fresh.refresh_token), expiry(fresh), refreshExpiry()],
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

export function shopeeApiFor(accountId: string, shopId: number) {
  let cached: Promise<string> | undefined;
  return new ShopeeApi(shopeeConfig(), shopId, () => (cached ??= validShopeeToken(accountId, shopId)));
}
