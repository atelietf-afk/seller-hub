import "server-only";
import { one, query } from "@/lib/db";

// Fotos dos produtos. Quem lê ou grava sempre passa pelo dono do produto (ownerId).

export interface CatalogImage {
  id: string;
  product_id: string;
  content_type: string;
  size: number;
  created_at: string;
}

export function imagesOf(ownerId: string, productId: string) {
  return query<CatalogImage>(
    `select i.id, i.product_id, i.content_type, i.size, i.created_at from catalog_images i
     join catalog_products p on p.id = i.product_id where p.owner_id = $1 and i.product_id = $2 order by i.created_at`,
    [ownerId, productId],
  );
}

export async function addImage(ownerId: string, productId: string, type: string, data: Buffer) {
  const owned = await one("select 1 from catalog_products where owner_id = $1 and id = $2", [ownerId, productId]);
  if (!owned) throw new Error("Produto não encontrado");
  const row = await one<{ id: string }>(
    "insert into catalog_images (product_id, content_type, size, data) values ($1, $2, $3, $4) returning id",
    [productId, type, data.length, data],
  );
  return row!.id;
}

export async function removeImage(ownerId: string, imageId: string) {
  await query(
    `delete from catalog_images i using catalog_products p
     where i.product_id = p.id and p.owner_id = $1 and i.id = $2`,
    [ownerId, imageId],
  );
}

/** Leitura pública (para a Meta baixar a foto): só devolve o que existe, sem dados do dono. */
export function publicImage(imageId: string) {
  return one<{ content_type: string; data: Buffer }>("select content_type, data from catalog_images where id = $1", [imageId]);
}
