// Atualização em massa de produtos: regras de entrada, antes de qualquer alteração.

export const BULK_ACTIONS = ["preco", "estoque", "ativar", "desativar"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const BULK_MAX_PRODUCTS = 200;

export function isBulkAction(v: unknown): v is BulkAction {
  return typeof v === "string" && (BULK_ACTIONS as readonly string[]).includes(v);
}

/** Motivos pelos quais a ação em massa não pode começar. Lista vazia = pode. */
export function bulkProblems(action: BulkAction, count: number, value: number | null): string[] {
  const problems: string[] = [];
  if (count === 0) problems.push("Selecione pelo menos um produto.");
  if (count > BULK_MAX_PRODUCTS) problems.push(`No máximo ${BULK_MAX_PRODUCTS} produtos por vez.`);
  if (action === "preco" && (value == null || value <= 0)) problems.push("Informe um preço maior que zero.");
  if (action === "estoque" && (value == null || !Number.isInteger(value) || value < 0)) {
    problems.push("Informe uma quantidade inteira, zero ou maior.");
  }
  return problems;
}
