import "server-only";
import { one, query } from "@/lib/db";
import type { Platform } from "@/lib/analytics/listings";

// Cadastro único de produtos. Tudo filtra pelo dono (ownerId): a equipe enxerga o que o dono cadastrou.

export interface CatalogProduct {
  id: string;
  owner_id: string;
  sku: string | null;
  name: string;
  description: string;
  price: number | null;
  cost: number | null;
  created_at: string;
}

export interface CatalogListing {
  id: string;
  product_id: string;
  platform: Platform;
  title: string;
  description: string;
  keywords: string[];
  to_confirm: string[];
  research: { trendKeywords: string[]; mlCategories: number } | null;
  updated_at: string;
}

export function productsOf(ownerId: string) {
  return query<CatalogProduct>("select * from catalog_products where owner_id = $1 order by created_at desc", [ownerId]);
}

export function productOf(ownerId: string, productId: string) {
  return one<CatalogProduct>("select * from catalog_products where owner_id = $1 and id = $2", [ownerId, productId]);
}

export function listingsOf(ownerId: string, productId: string) {
  return query<CatalogListing>(
    `select l.* from catalog_listings l join catalog_products p on p.id = l.product_id
     where p.owner_id = $1 and l.product_id = $2 order by l.platform`,
    [ownerId, productId],
  );
}

/** Categorias do Mercado Livre das lojas do dono: a pesquisa de tendências é feita nelas. */
export async function mlCategoriesOf(ownerId: string) {
  const rows = await query<{ category_id: string }>(
    `select distinct i.category_id from items i join ml_accounts a on a.id = i.account_id
     where a.owner_id = $1 and a.marketplace = 'mercadolivre' and i.category_id is not null`,
    [ownerId],
  );
  return rows.map((r) => r.category_id);
}

export async function createProduct(
  ownerId: string,
  p: { sku: string | null; name: string; description: string; price: number | null; cost: number | null },
) {
  const row = await one<{ id: string }>(
    `insert into catalog_products (owner_id, sku, name, description, price, cost) values ($1, $2, $3, $4, $5, $6) returning id`,
    [ownerId, p.sku, p.name, p.description, p.price, p.cost],
  );
  return row!.id;
}

/** Grava os anúncios de todas as lojas de uma vez. Só para produto do próprio dono. */
export async function saveListings(
  ownerId: string,
  productId: string,
  listings: Omit<CatalogListing, "id" | "product_id" | "updated_at">[],
) {
  if (!(await productOf(ownerId, productId))) throw new Error("Produto não encontrado");
  for (const l of listings) {
    await query(
      `insert into catalog_listings (product_id, platform, title, description, keywords, to_confirm, research)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (product_id, platform) do update set title = excluded.title, description = excluded.description,
         keywords = excluded.keywords, to_confirm = excluded.to_confirm, research = excluded.research, updated_at = now()`,
      [productId, l.platform, l.title, l.description, JSON.stringify(l.keywords), JSON.stringify(l.to_confirm), JSON.stringify(l.research)],
    );
  }
}
