// Preço de venda por loja: quanto cobrar para sobrar a margem desejada depois de comissão,
// taxa fixa, frete, imposto e custo do produto. Função pura, com testes.

export interface PlatformFees {
  /** Comissão da loja sobre o preço de venda (ex.: 0.14 = 14%). */
  commission: number;
  /** Taxa fixa por unidade vendida, em reais (0 quando não há). */
  fixedFee: number;
}

export interface PricingInput {
  cost: number; // custo do produto (com embalagem e mão de obra)
  shippingCost: number; // frete que o vendedor paga por unidade (0 quando o cliente paga)
  taxRate: number; // imposto sobre o faturamento (ex.: 0.06)
  fees: PlatformFees;
  targetMargin: number; // margem desejada sobre o preço (ex.: 0.2 = 20%)
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Preço mínimo que mantém a margem desejada.
 * Lucro = P − P·comissão − taxa fixa − frete − P·imposto − custo, e margem = lucro / P.
 * Isolando P: P = (custo + taxa fixa + frete) / (1 − comissão − imposto − margem).
 * Retorna null quando a conta não fecha (comissão + imposto + margem chegam a 100% ou mais).
 */
export function minimumPrice(input: PricingInput): number | null {
  const denominator = 1 - input.fees.commission - input.taxRate - input.targetMargin;
  if (denominator <= 0) return null;
  const fixed = input.cost + input.fees.fixedFee + input.shippingCost;
  return round(fixed / denominator);
}

/** Lucro e margem reais de um preço de venda escolhido. */
export function profitAtPrice(price: number, input: PricingInput) {
  const fees = price * input.fees.commission + input.fees.fixedFee;
  const tax = price * input.taxRate;
  const profit = price - fees - input.shippingCost - tax - input.cost;
  return {
    profit: round(profit),
    margin: price > 0 ? profit / price : 0,
  };
}
