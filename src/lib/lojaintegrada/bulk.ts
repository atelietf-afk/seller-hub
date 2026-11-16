import "server-only";
import * as catalog from "@/lib/data/catalog";
import type { BulkAction } from "@/lib/analytics/bulk";
import { getProduct, setPrice, setStock, updateProduct } from "./client";
import { priceBody, productBody, stockBody } from "./payload";

export interface BulkResult {
  done: number;
  failed: { name: string; reason: string }[];
}

/**
 * Aplica a ação a vários produtos: primeiro no Seller Hub, depois na Loja Integrada (só quem já foi enviado).
 * Uma falha num produto não interrompe os outros; a lista de falhas volta para a tela.
 */
export async function applyBulk(ownerId: string, ids: string[], action: BulkAction, value: number | null): Promise<BulkResult> {
  if (action === "preco") await catalog.setProductsPrice(ownerId, ids, value!);
  if (action === "estoque") await catalog.setProductsStock(ownerId, ids, value!);
  if (action === "ativar" || action === "desativar") await catalog.setProductsActive(ownerId, ids, action === "ativar");

  const products = await catalog.productsByIds(ownerId, ids);
  const result: BulkResult = { done: 0, failed: [] };
  for (const product of products) {
    const input = { name: product.name, description: product.description, sku: product.sku, price: product.price, cost: product.cost };
    try {
      if (product.loja_integrada_id) {
        const remote = product.loja_integrada_id;
        if (action === "preco") await setPrice(remote, priceBody(input));
        if (action === "estoque") await setStock(remote, stockBody(product.stock_quantity));
        if (action === "ativar" || action === "desativar") {
          // PUT exige o cadastro completo: lemos o produto e trocamos só a situação, mantendo as categorias.
          const current = await getProduct(remote);
          const categories = (current.categorias as string[] | undefined) ?? [];
          await updateProduct(remote, { ...productBody(input), ...current, ativo: action === "ativar", categorias: categories });
        }
      }
      result.done++;
    } catch (err) {
      console.error("Atualização em massa falhou", product.id, err);
      result.failed.push({ name: product.name, reason: (err as Error).message.slice(0, 200) });
    }
  }
  return result;
}
