// Monta o que será enviado à Loja Integrada (produto simples, com preço e estoque).
// Puro, para a prévia da tela e os testes usarem a mesma regra do envio.

export interface ProductInput {
  name: string;
  description: string;
  sku: string | null;
  price: number | null;
  cost: number | null;
}

export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Produto simples. Entra inativo: você revisa no painel antes de ativar. */
export function productBody(p: ProductInput, categoryId?: number) {
  return {
    altura: null,
    apelido: slugOf(p.name),
    ativo: false,
    categorias: categoryId ? [`/api/v1/categoria/${categoryId}`] : ([] as string[]),
    descricao_completa: p.description
      .split(/\n+/)
      .filter((l) => l.trim())
      .map((l) => `<p>${escapeHtml(l.trim())}</p>`)
      .join(""),
    destaque: false,
    id_externo: null,
    largura: null,
    marca: null,
    mpn: null,
    ncm: null,
    nome: p.name,
    peso: null,
    profundidade: null,
    removido: false,
    sku: p.sku,
    tipo: "normal",
    usado: false,
  };
}

/** Acha a categoria pelo nome (sem diferenciar maiúsculas e acento); se não existir, cria. */
export function sameCategory(a: string, b: string) {
  const n = (t: string) => t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return n(a) === n(b);
}

/** Preço de venda e de custo. Sem preço de venda, o envio é recusado antes de sair. */
export function priceBody(p: ProductInput) {
  return { cheio: p.price, custo: p.cost, promocional: null, sob_consulta: false };
}

/** Estoque: gerenciado pela loja, sem estoque é indisponível (-1) e o envio é imediato (0). */
export function stockBody(quantity: number) {
  return { gerenciado: true, quantidade: quantity, situacao_em_estoque: 0, situacao_sem_estoque: -1 };
}

/** Motivos pelos quais o produto não pode ser enviado. Lista vazia = pode. */
export function sendProblems(p: ProductInput): string[] {
  const problems: string[] = [];
  if (!p.sku?.trim()) problems.push("Informe o SKU: a Loja Integrada exige esse código.");
  if (p.price == null || p.price <= 0) problems.push("Informe o preço de venda.");
  return problems;
}
