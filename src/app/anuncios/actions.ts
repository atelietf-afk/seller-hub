"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateListings } from "@/lib/ai/listings";
import * as catalog from "@/lib/data/catalog";
import { trendsFor } from "@/lib/data/spy";
import { imagesOf } from "@/lib/data/images";
import { captionProblem } from "@/lib/analytics/images";
import { instagramConfigured, publicImageUrl, publishPhoto } from "@/lib/instagram";
import { publishProduct } from "@/lib/lojaintegrada/publish";
import { parseMoney } from "@/lib/format";
import { requirePermission } from "@/lib/session";

/** Cadastra o produto e gera os anúncios das quatro lojas, com a pesquisa de tendências do Mercado Livre. */
export async function createProductAction(formData: FormData) {
  const { ownerId } = await requirePermission("operar");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim() || null;
  const price = parseMoney(String(formData.get("price") ?? ""));
  const cost = parseMoney(String(formData.get("cost") ?? ""));
  if (!name || !description) redirect("/anuncios?erro=dados");

  // Pesquisa: tendências das categorias em que a loja já vende. Sem loja do Mercado Livre, fica vazia.
  const categories = await catalog.mlCategoriesOf(ownerId);
  const trends = categories.length ? await trendsFor(categories) : [];
  const trendKeywords = [...new Set(trends.map((t) => t.keyword))].slice(0, 30);

  let generated;
  try {
    generated = await generateListings({ name, description, price, trendKeywords });
  } catch (err) {
    console.error("Geração de anúncios falhou", err);
    redirect("/anuncios?erro=ia");
  }

  const id = await catalog.createProduct(ownerId, { sku, name, description, price, cost });
  const research = { trendKeywords, mlCategories: categories.length };
  await catalog.saveListings(
    ownerId,
    id,
    generated.map((l) => ({ ...l, research })),
  );
  revalidatePath("/anuncios");
  redirect(`/anuncios/${id}`);
}

/** Publica uma foto do produto no Instagram. Só roda com a confirmação marcada na tela. */
export async function publishInstagramAction(formData: FormData) {
  const { ownerId } = await requirePermission("operar");
  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const caption = String(formData.get("caption") ?? "");
  const back = (msg: string) => redirect(`/anuncios/${productId}?ig=${encodeURIComponent(msg)}#instagram`);

  if (formData.get("confirmo") !== "on") back("confirme");
  const problem = captionProblem(caption);
  if (problem) back(problem);
  if (!instagramConfigured()) back("Instagram ainda não configurado no servidor.");
  const owned = (await imagesOf(ownerId, productId)).some((i) => i.id === imageId);
  if (!owned) back("Foto não encontrada.");

  try {
    const mediaId = await publishPhoto(publicImageUrl(imageId), caption);
    console.info("Post publicado no Instagram", productId, mediaId);
  } catch (err) {
    console.error("Publicação no Instagram falhou", err);
    back(`A Meta recusou: ${(err as Error).message}`);
  }
  revalidatePath(`/anuncios/${productId}`);
  back("publicado");
}

/** Envia o produto à Loja Integrada (inativo) só com a confirmação marcada na tela. */
export async function publishLojaIntegradaAction(formData: FormData) {
  const { ownerId } = await requirePermission("operar");
  const productId = String(formData.get("productId") ?? "");
  const category = String(formData.get("categoria") ?? "");
  const back = (msg: string) => redirect(`/anuncios/${productId}?li=${encodeURIComponent(msg)}#loja-integrada`);
  if (formData.get("confirmo") !== "on") back("confirme");
  try {
    await publishProduct(ownerId, productId, category);
  } catch (err) {
    console.error("Envio à Loja Integrada falhou", err);
    back((err as Error).message);
  }
  revalidatePath(`/anuncios/${productId}`);
  back("enviado");
}
