"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateListings } from "@/lib/ai/listings";
import * as catalog from "@/lib/data/catalog";
import { trendsFor } from "@/lib/data/spy";
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
