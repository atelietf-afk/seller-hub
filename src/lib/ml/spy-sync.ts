import "server-only";
import { one, query } from "@/lib/db";
import { MlSpyApi, type Listing } from "./spy-api";
import { mapLimit, pushEvents, type NewEvent } from "./store";
import { apiFor } from "./tokens";

const MAX_CATEGORIES = 8;
const PUBLIC_DATA_MAX_AGE_H = 20; // tendências e mais vendidos mudam devagar
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface SpySyncResult {
  categories: number;
  refreshed: number;
  trends: number;       // buscas em alta recebidas nesta sincronização
  bestSellers: number;  // mais vendidos recebidos nesta sincronização
  catalog: number;
  competitors: number;
  errors: string[];
}

/** Categorias onde o vendedor mais fatura (30 dias); completa com as que têm mais anúncios ativos. */
async function topCategories(accountId: string): Promise<string[]> {
  const rows = await query<{ category_id: string }>(
    `select i.category_id
     from items i
     left join order_items oi on oi.item_id = i.id
     left join orders o on o.id = oi.order_id and o.date_created > now() - interval '30 days' and o.status = 'paid'
     where i.account_id = $1 and i.status = 'active' and i.category_id is not null
     group by i.category_id
     order by coalesce(sum(case when o.id is not null then oi.unit_price * oi.quantity end), 0) desc, count(distinct i.id) desc
     limit $2`,
    [accountId, MAX_CATEGORIES],
  );
  return rows.map((r) => r.category_id);
}

async function refreshCategory(spy: MlSpyApi, site: string, categoryId: string, result: SpySyncResult) {
  // Falha numa parte não impede as outras, mas fica registrada (os logs da Vercel duram pouco).
  const note = (part: string) => (err: unknown) => {
    result.errors.push(`${part} ${categoryId}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
    return [];
  };
  const fresh = await one<{ fresh: boolean }>(
    `select bool_and(updated_at > now() - make_interval(hours => $2)) as fresh
     from (select updated_at from category_trends where category_id = $1
           union all select updated_at from category_best_sellers where category_id = $1) t`,
    [categoryId, PUBLIC_DATA_MAX_AGE_H],
  );
  if (fresh?.fresh) return false;

  const name = await spy.categoryName(categoryId).catch(() => null);
  if (name) {
    await query(
      "insert into categories (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name, updated_at = now()",
      [categoryId, name],
    );
  }

  // Só troca os dados guardados quando a API devolveu algo; numa falha, mantém os anteriores.
  const trends = await spy.trends(site, categoryId).catch(note("tendências"));
  result.trends += trends.length;
  if (trends.length) {
    await query("delete from category_trends where category_id = $1", [categoryId]);
    await query(
      `insert into category_trends (category_id, position, keyword)
       select $1, (t->>'position')::int, t->>'keyword' from json_array_elements($2::json) t
       on conflict do nothing`,
      [categoryId, JSON.stringify(trends)],
    );
  }

  const highlights = await spy.highlights(site, categoryId).catch(note("mais vendidos"));
  const itemIds = highlights.filter((h) => h.kind === "ITEM").map((h) => h.id);
  const byId = new Map<string, Listing>(
    (itemIds.length ? await spy.listings(itemIds).catch(note("anúncios dos mais vendidos")) : []).map((l) => [l.id, l]),
  );
  await mapLimit(
    highlights.filter((h) => h.kind !== "ITEM"),
    4,
    async (h) => {
      const p = await spy.product(h.id).catch(() => null);
      if (p) byId.set(h.id, p);
    },
  );
  const rows = highlights.map((h) => ({ ...h, l: byId.get(h.id) }));
  result.bestSellers += rows.length;
  if (rows.length) {
    await query("delete from category_best_sellers where category_id = $1", [categoryId]);
    await query(
      `insert into category_best_sellers (category_id, position, kind, id, title, price, seller_id, free_shipping, logistic_type, thumbnail, permalink)
       select $1, (r->>'position')::int, r->>'kind', r->>'id', r->'l'->>'title', (r->'l'->>'price')::numeric, (r->'l'->>'sellerId')::bigint,
              (r->'l'->>'freeShipping')::boolean, r->'l'->>'logisticType', r->'l'->>'thumbnail', r->'l'->>'permalink'
       from json_array_elements($2::json) r
       on conflict do nothing`,
      [categoryId, JSON.stringify(rows)],
    );
  }
  return true;
}

export async function saveCompetitorSnapshot(accountId: string, id: string, l: Listing, day: string) {
  await query(
    `insert into competitor_snapshots (account_id, item_id, day, title, price, status, available_quantity, sold_quantity, seller_id,
       free_shipping, logistic_type, thumbnail, permalink)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (account_id, item_id, day) do update set title = excluded.title, price = excluded.price, status = excluded.status,
       available_quantity = excluded.available_quantity, sold_quantity = excluded.sold_quantity, free_shipping = excluded.free_shipping,
       logistic_type = excluded.logistic_type, thumbnail = excluded.thumbnail, permalink = excluded.permalink`,
    [accountId, id, day, l.title, l.price, l.status, l.availableQuantity, l.soldQuantity, l.sellerId, l.freeShipping, l.logisticType, l.thumbnail, l.permalink],
  );
}

const WINNING = new Set(["winning", "sharing_first_place"]);

/**
 * Espião: tendências e mais vendidos das categorias do vendedor, disputa de catálogo
 * dos anúncios dele e acompanhamento dos concorrentes escolhidos. Nunca lança erro.
 */
export async function syncSpy(accountId: string): Promise<SpySyncResult> {
  const result: SpySyncResult = { categories: 0, refreshed: 0, trends: 0, bestSellers: 0, catalog: 0, competitors: 0, errors: [] };
  const fail = (step: string) => (err: unknown) => {
    result.errors.push(`${step}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
  };
  const account = await one<{ site_id: string }>("select site_id from ml_accounts where id = $1", [accountId]);
  if (!account) return result;
  const spy = new MlSpyApi(apiFor(accountId));
  const today = new Date().toISOString().slice(0, 10);
  const events: NewEvent[] = [];

  // 1. Dados públicos por categoria
  const categories = await topCategories(accountId);
  result.categories = categories.length;
  for (const c of categories) {
    await refreshCategory(spy, account.site_id, c, result)
      .then((did) => void (did && result.refreshed++))
      .catch(fail(`categoria ${c}`));
  }

  // 2. Disputa de catálogo
  await (async () => {
    const own = await query<{ id: string; title: string }>(
      "select id, title from items where account_id = $1 and catalog_listing and status = 'active' order by sold_quantity desc limit 100",
      [accountId],
    );
    await mapLimit(own, 5, async (item) => {
      const c = await spy.priceToWin(item.id);
      if (!c) return;
      const before = await one<{ status: string | null }>(
        "select status from catalog_competition where account_id = $1 and item_id = $2",
        [accountId, item.id],
      );
      await query(
        `insert into catalog_competition (account_id, item_id, status, price, price_to_win, winner_item_id, winner_price, reasons)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (account_id, item_id) do update set status = excluded.status, price = excluded.price,
           price_to_win = excluded.price_to_win, winner_item_id = excluded.winner_item_id, winner_price = excluded.winner_price,
           reasons = excluded.reasons, updated_at = now()`,
        [accountId, item.id, c.status, c.price, c.priceToWin, c.winnerItemId, c.winnerPrice, JSON.stringify(c.reasons)],
      );
      result.catalog++;
      if (before?.status && WINNING.has(before.status) && c.status && !WINNING.has(c.status)) {
        events.push({
          kind: "alert",
          severity: "critical",
          title: "Você perdeu a disputa do catálogo",
          body: `"${item.title}": ${c.priceToWin != null ? `preço para ganhar ${brl(c.priceToWin)}` : "veja o motivo no Espião"}.`,
          itemId: item.id,
          dedupeKey: `catalog-lost:${item.id}:${today}`,
        });
      }
    });
  })().catch(fail("catálogo"));

  // 3. Concorrentes acompanhados
  await (async () => {
    const tracked = await query<{ item_id: string; kind: string }>("select item_id, kind from competitors where account_id = $1", [accountId]);
    const items = tracked.filter((t) => t.kind === "item").map((t) => t.item_id);
    const listings = new Map<string, Listing>((items.length ? await spy.listings(items) : []).map((l) => [l.id, l]));
    await mapLimit(
      tracked.filter((t) => t.kind === "product"),
      4,
      async (t) => {
        const p = await spy.product(t.item_id);
        if (p) listings.set(t.item_id, p);
      },
    );
    for (const [id, l] of listings) {
      const prev = await one<{ price: number | null }>(
        "select price from competitor_snapshots where account_id = $1 and item_id = $2 and day < $3 order by day desc limit 1",
        [accountId, id, today],
      );
      await saveCompetitorSnapshot(accountId, id, l, today);
      result.competitors++;
      if (prev?.price && l.price && l.price <= prev.price * 0.97) {
        events.push({
          kind: "alert",
          severity: "warning",
          title: `Concorrente baixou o preço ${Math.round((1 - l.price / prev.price) * 100)}%`,
          body: `"${l.title ?? id}": de ${brl(prev.price)} para ${brl(l.price)}.`,
          dedupeKey: `competitor-price:${id}:${today}`,
        });
      }
    }
  })().catch(fail("concorrentes"));

  await pushEvents(accountId, events).catch(fail("eventos"));
  await query("update ml_accounts set spy_synced_at = now(), spy_result = $2 where id = $1", [accountId, JSON.stringify(result)]).catch(
    fail("status"),
  );
  console.info("Espião sincronizado", accountId, JSON.stringify(result));
  return result;
}
