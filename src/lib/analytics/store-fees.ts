// Taxas de cada loja usadas no cálculo de preço. São ESTIMATIVAS: as lojas mudam as tabelas,
// então confira a comissão atual na área do vendedor de cada uma e ajuste aqui.

import type { PlatformFees } from "./pricing";

export const STORE_FEES: Record<"mercadolivre" | "shopee" | "amazon" | "loja_integrada", PlatformFees & { label: string }> = {
  mercadolivre: { label: "Mercado Livre", commission: 0.13, fixedFee: 0 },
  shopee: { label: "Shopee", commission: 0.14, fixedFee: 4 },
  amazon: { label: "Amazon", commission: 0.15, fixedFee: 0 },
  loja_integrada: { label: "Loja Integrada (site próprio)", commission: 0.0, fixedFee: 0 },
};

export const DEFAULT_TARGET_MARGIN = 0.2;
