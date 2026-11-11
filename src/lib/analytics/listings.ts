// Regras de cada loja para os anúncios gerados a partir do cadastro único.

export const PLATFORMS = ["mercadolivre", "shopee", "amazon", "loja_integrada"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  loja_integrada: "Loja Integrada",
};

/**
 * Limite de caracteres do título. Conferir na documentação antes de publicar: as lojas mudam essas regras.
 * Para a Loja Integrada usamos um limite conservador, porque o próprio site define o tamanho do título.
 */
export const TITLE_MAX: Record<Platform, number> = { mercadolivre: 60, shopee: 120, amazon: 200, loja_integrada: 120 };

const ML_BANNED = /promo[çc][ãa]o|frete gr[áa]tis|oferta|melhor pre[çc]o/i;

export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
}

/** Motivos pelos quais o título não pode ser publicado como está. Lista vazia = pode. */
export function titleProblems(platform: Platform, title: string): string[] {
  const t = title.trim();
  const problems: string[] = [];
  if (!t) problems.push("Título vazio.");
  if (t.length > TITLE_MAX[platform]) problems.push(`Passa de ${TITLE_MAX[platform]} caracteres (tem ${t.length}).`);
  if (platform === "mercadolivre" && ML_BANNED.test(t)) problems.push("O Mercado Livre não aceita promoção, frete ou oferta no título.");
  return problems;
}
