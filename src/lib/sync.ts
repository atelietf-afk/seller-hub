import "server-only";
import type { Marketplace } from "./data/types";
import { syncAmazon } from "./amazon/sync";
import { syncAccount } from "./ml/sync";
import { syncShopee } from "./shopee/sync";

/** Sincroniza a conta no marketplace dela. */
export async function syncAnyAccount(account: { id: string; marketplace: Marketplace }) {
  if (account.marketplace === "shopee") return syncShopee(account.id);
  if (account.marketplace === "amazon") return syncAmazon(account.id);
  return syncAccount(account.id);
}
