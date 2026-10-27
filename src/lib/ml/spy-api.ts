import { MlApi, MlApiError } from "./api";
import type { MlItem } from "./types";

// Dados de concorrência que a API do ML ainda libera para aplicativos
// (a busca pública /sites/MLB/search devolve 403 desde 2025).

type Obj = Record<string, unknown>;
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (v == null ? null : String(v));

export interface Trend {
  keyword: string;
  position: number;
}

export interface Highlight {
  id: string;
  position: number;
  kind: "ITEM" | "PRODUCT" | "USER_PRODUCT" | string;
}

export interface Listing {
  id: string;
  title: string | null;
  price: number | null;
  sellerId: number | null;
  freeShipping: boolean | null;
  logisticType: string | null;
  thumbnail: string | null;
  permalink: string | null;
  status: string | null;
  availableQuantity: number | null;
  soldQuantity: number | null;
}

export interface CatalogCompetition {
  status: string | null;
  price: number | null;
  priceToWin: number | null;
  winnerItemId: string | null;
  winnerPrice: number | null;
  reasons: string[];
}

export function listingFromItem(i: MlItem & Obj): Listing {
  return {
    id: i.id,
    title: i.title ?? null,
    price: num(i.price),
    sellerId: num(i.seller_id),
    freeShipping: i.shipping?.free_shipping ?? null,
    logisticType: i.shipping?.logistic_type ?? null,
    thumbnail: i.thumbnail ?? null,
    permalink: i.permalink ?? null,
    status: i.status ?? null,
    // Para anúncios de outros vendedores o ML pode omitir esses campos.
    availableQuantity: num(i.available_quantity),
    soldQuantity: num(i.sold_quantity),
  };
}

export function listingFromProduct(p: Obj): Listing {
  const w = (p.buy_box_winner ?? {}) as Obj;
  const ship = (w.shipping ?? {}) as Obj;
  const pics = Array.isArray(p.pictures) ? (p.pictures as Obj[]) : [];
  return {
    id: String(p.id),
    title: str(p.name ?? p.title),
    price: num(w.price),
    sellerId: num(w.seller_id),
    freeShipping: ship.free_shipping == null ? null : Boolean(ship.free_shipping),
    logisticType: str(ship.logistic_type),
    thumbnail: str(pics[0]?.url ?? pics[0]?.secure_url),
    permalink: str(p.permalink) ?? `https://www.mercadolivre.com.br/p/${p.id}`,
    status: str(p.status),
    availableQuantity: null,
    soldQuantity: null,
  };
}

export function parseCompetition(b: Obj): CatalogCompetition {
  const winner = (b.winner ?? {}) as Obj;
  const reasons = Array.isArray(b.reason) ? b.reason : Array.isArray(b.reasons) ? b.reasons : [];
  return {
    status: str(b.status),
    price: num(b.current_price ?? b.price),
    priceToWin: num(b.price_to_win),
    winnerItemId: str(winner.item_id ?? winner.id),
    winnerPrice: num(winner.price),
    reasons: reasons.map(String),
  };
}

export class MlSpyApi {
  constructor(private api: MlApi) {}

  async categoryName(categoryId: string): Promise<string | null> {
    const body = await this.api.get<Obj>(`/categories/${categoryId}`);
    return str(body?.name);
  }

  /** Buscas em alta na categoria (até 50), da mais forte para a mais fraca. */
  async trends(site: string, categoryId: string): Promise<Trend[]> {
    const body = await this.api.get<unknown>(`/trends/${site}/${categoryId}`);
    const list = Array.isArray(body) ? (body as Obj[]) : [];
    return list.filter((t) => t.keyword).map((t, i) => ({ keyword: String(t.keyword), position: i + 1 }));
  }

  /** Os 20 mais vendidos da categoria (anúncios ou produtos de catálogo). */
  async highlights(site: string, categoryId: string): Promise<Highlight[]> {
    const body = (await this.api.get<Obj>(`/highlights/${site}/category/${categoryId}`)) ?? {};
    const content = Array.isArray(body.content) ? (body.content as Obj[]) : [];
    return content
      .filter((c) => c.id)
      .map((c, i) => ({ id: String(c.id), position: num(c.position) ?? i + 1, kind: String(c.type ?? "ITEM").toUpperCase() }));
  }

  async product(id: string): Promise<Listing | null> {
    try {
      return listingFromProduct(await this.api.get<Obj>(`/products/${id}`));
    } catch (err) {
      if (err instanceof MlApiError && [403, 404].includes(err.status)) return null;
      throw err;
    }
  }

  async listings(ids: string[]): Promise<Listing[]> {
    return (await this.api.items(ids)).map((i) => listingFromItem(i as MlItem & Obj));
  }

  /** Situação de um anúncio próprio na disputa do catálogo. */
  async priceToWin(itemId: string): Promise<CatalogCompetition | null> {
    try {
      return parseCompetition(await this.api.get<Obj>(`/items/${itemId}/price_to_win?version=v2`));
    } catch (err) {
      if (err instanceof MlApiError && [400, 403, 404].includes(err.status)) return null;
      throw err;
    }
  }
}
