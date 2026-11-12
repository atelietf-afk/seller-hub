import "server-only";
import * as catalog from "@/lib/data/catalog";
import { createProduct, setPrice, setStock } from "./client";
import { priceBody, productBody, sendProblems, stockBody } from "./payload";

/**
 * Envia um produto do cadastro à Loja Integrada: produto (inativo), preço e estoque zerado.
 * O id é gravado logo após criar o produto, para nunca enviar duas vezes.
 */
export async function publishProduct(ownerId: string, productId: string): Promise<number> {
  const product = await catalog.productOf(ownerId, productId);
  if (!product) throw new Error("Produto não encontrado");
  if (product.loja_integrada_id) throw new Error("Este produto já foi enviado à Loja Integrada.");
  const input = { name: product.name, description: product.description, sku: product.sku, price: product.price, cost: product.cost };
  const problems = sendProblems(input);
  if (problems.length) throw new Error(problems.join(" "));

  const created = await createProduct(productBody(input));
  await catalog.setLojaIntegradaId(ownerId, productId, created.id);
  await setPrice(created.id, priceBody(input));
  await setStock(created.id, stockBody(0));
  return created.id;
}
