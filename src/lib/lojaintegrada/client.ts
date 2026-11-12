import "server-only";

// Cliente da API da Loja Integrada. Autenticação: "Basic" com o personal token da loja.
const BASE = "https://api.awsli.com.br/v1";

export function lojaIntegradaConfigured() {
  return !!process.env.LOJA_INTEGRADA_TOKEN;
}

async function call<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const token = process.env.LOJA_INTEGRADA_TOKEN;
  if (!token) throw new Error("Loja Integrada não configurada no servidor");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Basic ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Loja Integrada respondeu ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const createProduct = (body: unknown) => call<{ id: number }>("POST", "/produto", body);
export const setPrice = (id: number, body: unknown) => call<unknown>("PUT", `/produto_preco/${id}`, body);
export const setStock = (id: number, body: unknown) => call<unknown>("PUT", `/produto_estoque/${id}`, body);
