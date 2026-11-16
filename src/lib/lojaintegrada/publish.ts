import "server-only";
import * as catalog from "@/lib/data/catalog";
import { publicImageUrl } from "@/lib/instagram";
import { imagesOf } from "@/lib/data/images";
import { countProductImages, createCategory, createProduct, createProductImage, listCategories, setPrice, setStock } from "./client";
import { imagePayload, priceBody, productBody, sameCategory, sendProblems, stockBody } from "./payload";

/**
 * Envia um produto do cadastro à Loja Integrada: produto (inativo), preço e estoque zerado.
 * O id é gravado logo após criar o produto, para nunca enviar duas vezes.
 */
export async function publishProduct(ownerId: string, productId: string, categoryName?: string): Promise<number> {
  const product = await catalog.productOf(ownerId, productId);
  if (!product) throw new Error("Produto não encontrado");
  if (product.loja_integrada_id) throw new Error("Este produto já foi enviado à Loja Integrada.");
  const input = { name: product.name, description: product.description, sku: product.sku, price: product.price, cost: product.cost };
  const problems = sendProblems(input);
  if (problems.length) throw new Error(problems.join(" "));

  let categoryId: number | undefined;
  const name = categoryName?.trim();
  if (name) {
    const existing = (await listCategories()).find((c) => sameCategory(c.nome, name));
    categoryId = existing?.id ?? (await createCategory(name)).id;
  }
  const created = await createProduct(productBody(input, categoryId));
  await catalog.setLojaIntegradaId(ownerId, productId, created.id);
  await setPrice(created.id, priceBody(input));
  await setStock(created.id, stockBody(product.stock_quantity));

  // Fotos: a Loja Integrada baixa cada uma pelo link público do Seller Hub.
  const failures: string[] = [];
  const photos = await imagesOf(ownerId, productId);
  for (const [index, photo] of photos.entries()) {
    try {
      await createProductImage(imagePayload(created.id, publicImageUrl(photo.id, photo.content_type), index, photo.content_type));
    } catch (err) {
      failures.push((err as Error).message);
    }
  }
  if (failures.length) throw new Error(`Produto enviado, mas ${failures.length} foto(s) falharam: ${failures[0]}`);
  return created.id;
}

/**
 * Envia as fotos que faltaram num produto já enviado. Consulta quantas fotos a loja já tem
 * e manda só o restante, na ordem, para não duplicar.
 */
export async function resendMissingPhotos(ownerId: string, productId: string): Promise<number> {
  const product = await catalog.productOf(ownerId, productId);
  if (!product?.loja_integrada_id) throw new Error("Envie o produto antes de reenviar as fotos.");
  const remoteId = product.loja_integrada_id;
  const onStore = await countProductImages(remoteId);
  const photos = await imagesOf(ownerId, productId);
  const missing = photos.slice(onStore);
  for (const [offset, photo] of missing.entries()) {
    await createProductImage(imagePayload(remoteId, publicImageUrl(photo.id, photo.content_type), onStore + offset, photo.content_type));
  }
  return missing.length;
}

/** Envia a quantidade do estoque único ao produto já cadastrado na Loja Integrada. */
export async function pushStockToLojaIntegrada(ownerId: string, productId: string): Promise<number> {
  const product = await catalog.productOf(ownerId, productId);
  if (!product) throw new Error("Produto não encontrado");
  if (!product.loja_integrada_id) throw new Error("Envie o produto à Loja Integrada antes de atualizar o estoque.");
  await setStock(product.loja_integrada_id, stockBody(product.stock_quantity));
  return product.stock_quantity;
}
