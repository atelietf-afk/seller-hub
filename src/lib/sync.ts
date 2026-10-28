import "server-only";
import type { Marketplace } from "./data/types";
import { syncAccount } from "./ml/sync";
import { syncShopee } from "./shopee/sync";

/** Sincroniza a conta no marketplace dela. */
export async function syncAnyAccount(account: { id: string; marketplace: Marketplace }) {
  return account.marketplace === "shopee" ? syncShopee(account.id) : syncAccount(account.id);
}
