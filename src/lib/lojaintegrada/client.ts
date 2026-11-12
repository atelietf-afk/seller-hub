import "server-only";

// Cliente da API da Loja Integrada. Autenticação: "Basic" com o personal token da loja.
const BASE = "https://api.awsli.com.br/v1";

export function lojaIntegradaConfigured() {
  return !!process.env.LOJA_INTEGRADA_TOKEN;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const token = process.env.LOJA_INTEGRADA_TOKEN;
  if (!token) throw new Error("Loja Integrada não configurada no servidor");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Authorization: `Basic ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Loja Integrada respondeu ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const createProduct = (body: unknown) => call<{ id: number }>("POST", "/produto", body);
export const setPrice = (id: number, body: unknown) => call<unknown>("PUT", `/produto_preco/${id}`, body);
export const setStock = (id: number, body: unknown) => call<unknown>("PUT", `/produto_estoque/${id}`, body);

interface Page<T> {
  meta: { next: string | null };
  objects: T[];
}

/** Todas as categorias da loja, seguindo a paginação. */
export async function listCategories(): Promise<{ id: number; nome: string }[]> {
  const all: { id: number; nome: string }[] = [];
  let offset = 0;
  for (;;) {
    const page = await call<Page<{ id: number; nome: string }>>("GET", `/categoria?limit=100&offset=${offset}`, undefined);
    all.push(...page.objects);
    if (!page.meta.next || page.objects.length === 0) return all;
    offset += 100;
  }
}

export const createCategory = (nome: string) =>
  call<{ id: number }>("POST", "/categoria", { id_externo: null, nome, descricao: null, categoria_pai: null });

export const createProductImage = (body: unknown) => call<{ id: number }>("POST", "/produto_imagem", body);

/** Quantas fotos o produto já tem na Loja Integrada. */
export async function countProductImages(remoteProductId: number): Promise<number> {
  const page = await call<{ meta: { total_count: number } }>("GET", `/produto_imagem?produto=${remoteProductId}`, undefined);
  return page.meta.total_count;
}
