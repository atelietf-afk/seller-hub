import "server-only";
import { one, query } from "@/lib/db";

// Leitura e escrita do espião. Dados do vendedor sempre conferem o dono (ownerId);
// tendências e mais vendidos são públicos (iguais para todos).

export interface SpyItem {
  id: string;
  title: string;
  price: number;
  category_id: string | null;
  free_shipping: boolean;
  logistic_type: string | null;
  pictures_count: number | null;
  thumbnail: string | null;
  revenue_30d: number;
}

export async function ownActiveItems(ownerId: string, accountId: string, limit = 60) {
  return query<SpyItem>(
    `select i.id, i.title, i.price, i.category_id, i.free_shipping, i.logistic_type, i.pictures_count, i.thumbnail,
            coalesce(sum(oi.unit_price * oi.quantity) filter (where o.id is not null), 0) as revenue_30d
     from items i
     join ml_accounts a on a.id = i.account_id and a.owner_id = $2
     left join order_items oi on oi.item_id = i.id
     left join orders o on o.id = oi.order_id and o.status = 'paid' and o.date_created > now() - interval '30 days'
     where i.account_id = $1 and i.status = 'active'
     group by i.id
     order by revenue_30d desc, i.sold_quantity desc
     limit $3`,
    [accountId, ownerId, limit],
  );
}

export interface TrendRow {
  category_id: string;
  position: number;
  keyword: string;
}

export function trendsFor(categoryIds: string[]) {
  return query<TrendRow>("select category_id, position, keyword from category_trends where category_id = any($1) order by position", [
    categoryIds,
  ]);
}

export interface BestSellerRow {
  category_id: string;
  position: number;
  kind: string;
  id: string;
  title: string | null;
  price: number | null;
  seller_id: number | null;
  free_shipping: boolean | null;
  logistic_type: string | null;
  thumbnail: string | null;
  permalink: string | null;
  updated_at: string;
}

export function bestSellersFor(categoryIds: string[]) {
  return query<BestSellerRow>("select * from category_best_sellers where category_id = any($1) order by category_id, position", [
    categoryIds,
  ]);
}

export function categoryNames(categoryIds: string[]) {
  return query<{ id: string; name: string }>("select id, name from categories where id = any($1)", [categoryIds]);
}

export interface CatalogRow {
  item_id: string;
  title: string;
  thumbnail: string | null;
  status: string | null;
  price: number | null;
  price_to_win: number | null;
  winner_item_id: string | null;
  winner_price: number | null;
  reasons: string[] | null;
  updated_at: string;
}

export function catalogFor(ownerId: string, accountId: string) {
  return query<CatalogRow>(
    `select c.item_id, i.title, i.thumbnail, c.status, c.price, c.price_to_win, c.winner_item_id, c.winner_price, c.reasons, c.updated_at
     from catalog_competition c
     join ml_accounts a on a.id = c.account_id and a.owner_id = $2
     join items i on i.id = c.item_id
     where c.account_id = $1
     order by case c.status when 'competing' then 0 when 'listed' then 1 when 'sharing_first_place' then 2 else 3 end, i.sold_quantity desc`,
    [accountId, ownerId],
  );
}

export interface CompetitorRow {
  item_id: string;
  kind: "item" | "product";
  note: string | null;
  created_at: string;
  title: string | null;
  price: number | null;
  status: string | null;
  available_quantity: number | null;
  sold_quantity: number | null;
  free_shipping: boolean | null;
  logistic_type: string | null;
  thumbnail: string | null;
  permalink: string | null;
  last_day: string | null;
  first_price: number | null;
  week_ago_price: number | null;
  min_price: number | null;
}

export function competitorsFor(ownerId: string, accountId: string) {
  return query<CompetitorRow>(
    `select c.item_id, c.kind, c.note, c.created_at, s.title, s.price, s.status, s.available_quantity, s.sold_quantity,
            s.free_shipping, s.logistic_type, s.thumbnail, s.permalink, s.day as last_day,
            (select price from competitor_snapshots x where x.account_id = c.account_id and x.item_id = c.item_id order by day asc limit 1) as first_price,
            (select price from competitor_snapshots x where x.account_id = c.account_id and x.item_id = c.item_id
               and x.day <= current_date - 7 order by day desc limit 1) as week_ago_price,
            (select min(price) from competitor_snapshots x where x.account_id = c.account_id and x.item_id = c.item_id) as min_price
     from competitors c
     join ml_accounts a on a.id = c.account_id and a.owner_id = $2
     left join lateral (
       select * from competitor_snapshots x where x.account_id = c.account_id and x.item_id = c.item_id order by day desc limit 1
     ) s on true
     where c.account_id = $1
     order by c.created_at desc`,
    [accountId, ownerId],
  );
}

/** Cadastra um concorrente só se a conta for do usuário. Devolve false caso contrário. */
export async function addCompetitor(ownerId: string, accountId: string, itemId: string, kind: "item" | "product", note: string | null) {
  const rows = await query(
    `insert into competitors (account_id, item_id, kind, note)
     select a.id, $3, $4, $5 from ml_accounts a where a.id = $1 and a.owner_id = $2
     on conflict (account_id, item_id) do update set note = coalesce(excluded.note, competitors.note)
     returning item_id`,
    [accountId, ownerId, itemId, kind, note],
  );
  return rows.length > 0;
}

export async function removeCompetitor(ownerId: string, accountId: string, itemId: string) {
  await query(
    "delete from competitors c using ml_accounts a where a.id = c.account_id and a.owner_id = $2 and c.account_id = $1 and c.item_id = $3",
    [accountId, ownerId, itemId],
  );
}

export async function competitorCount(accountId: string) {
  return (await one<{ n: number }>("select count(*)::int as n from competitors where account_id = $1", [accountId]))?.n ?? 0;
}

export interface TitleSuggestionRow {
  item_id: string;
  content: { titles: { title: string; why: string; verify: string[] }[] };
  created_at: string;
}

export function titleSuggestionsFor(ownerId: string, accountId: string) {
  return query<TitleSuggestionRow>(
    `select t.item_id, t.content, t.created_at from title_suggestions t
     join ml_accounts a on a.id = t.account_id and a.owner_id = $2 where t.account_id = $1`,
    [accountId, ownerId],
  );
}

/** Item do usuário (para gerar título). null se não for dele. */
export function ownItem(ownerId: string, accountId: string, itemId: string) {
  return one<{ id: string; title: string; price: number; category_id: string | null }>(
    `select i.id, i.title, i.price, i.category_id from items i join ml_accounts a on a.id = i.account_id and a.owner_id = $2
     where i.account_id = $1 and i.id = $3`,
    [accountId, ownerId, itemId],
  );
}

export async function saveTitleSuggestion(accountId: string, itemId: string, content: unknown) {
  await query(
    `insert into title_suggestions (account_id, item_id, content) values ($1, $2, $3)
     on conflict (account_id, item_id) do update set content = excluded.content, created_at = now()`,
    [accountId, itemId, JSON.stringify(content)],
  );
}

export interface SpyStatus {
  spy_synced_at: string | null;
  spy_result: {
    categories: number;
    refreshed: number;
    trends?: number;
    bestSellers?: number;
    catalog: number;
    competitors: number;
    errors: string[];
  } | null;
}

export function spyStatus(ownerId: string, accountId: string) {
  return one<SpyStatus>("select spy_synced_at, spy_result from ml_accounts where id = $1 and owner_id = $2", [accountId, ownerId]);
}
