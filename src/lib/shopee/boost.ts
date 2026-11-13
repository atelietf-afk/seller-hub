import "server-only";
import { query } from "@/lib/db";
import { pickBoostItems, type BoostCandidate } from "@/lib/analytics/boost";
import { ShopeeShop } from "./shop";
import { shopeeApiFor } from "./tokens";

export interface BoostResult {
  picked: number;
  boosted: number;
  failed: { id: string; reason: string }[];
}

/** Impulsiona até 5 produtos com estoque da loja e grava quais subiram. */
export async function boostShopeeItems(accountId: string, now = new Date()): Promise<BoostResult> {
  const account = await query<{ ml_user_id: number }>("select ml_user_id from ml_accounts where id = $1 and marketplace = 'shopee'", [
    accountId,
  ]);
  if (!account[0]) throw new Error(`Conta ${accountId} não é da Shopee`);

  const candidates = await query<BoostCandidate>(
    "select id, status, available_quantity from items where account_id = $1 and status = 'active' and available_quantity > 0",
    [accountId],
  );
  const last = await query<{ item_id: string; boosted_at: string }>("select item_id, boosted_at from shopee_boosts where account_id = $1", [
    accountId,
  ]);
  const lastBoosted = new Map(last.map((r) => [r.item_id, new Date(r.boosted_at)]));
  const picked = pickBoostItems(candidates, lastBoosted, now);
  if (!picked.length) return { picked: 0, boosted: 0, failed: [] };

  // O id na Shopee é o número sem o prefixo SHP.
  const shop = new ShopeeShop(shopeeApiFor(accountId, Number(account[0].ml_user_id)));
  const result = await shop.boostItems(picked.map((p) => Number(p.id.replace(/^SHP/, ""))));

  const okIds = (result.success_list?.item_id_list ?? []).map((n) => `SHP${n}`);
  for (const id of okIds) {
    await query(
      `insert into shopee_boosts (account_id, item_id, boosted_at) values ($1, $2, $3)
       on conflict (account_id, item_id) do update set boosted_at = excluded.boosted_at`,
      [accountId, id, now.toISOString()],
    );
  }
  const failed = (result.failure_list ?? []).map((f) => ({ id: `SHP${f.item_id}`, reason: f.failed_reason }));
  console.info("Impulsionamento Shopee", accountId, JSON.stringify({ picked: picked.length, boosted: okIds.length, failed }));
  return { picked: picked.length, boosted: okIds.length, failed };
}
