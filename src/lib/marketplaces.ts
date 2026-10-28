import type { Marketplace } from "./data/types";

export const MARKETPLACE_LABEL: Record<Marketplace, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon" };
export const MARKETPLACE_SHORT: Record<Marketplace, string> = { mercadolivre: "ML", shopee: "Shopee", amazon: "Amazon" };
/** Rota que inicia (ou refaz) a conexão com o marketplace. */
export const CONNECT_PATH: Record<Marketplace, string> = {
  mercadolivre: "/api/ml/connect",
  shopee: "/api/shopee/connect",
  amazon: "/api/amazon/connect",
};
