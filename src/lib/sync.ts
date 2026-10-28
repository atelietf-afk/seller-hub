import "server-only";
import type { Marketplace } from "./data/types";
import { syncAccount } from "./ml/sync";

/** Sincroniza a conta no marketplace dela. */
export async function syncAnyAccount(account: { id: string; marketplace: Marketplace }) {
  if (account.marketplace === "shopee") throw new Error("Sincronização da Shopee ainda não disponível");
  return syncAccount(account.id);
}
