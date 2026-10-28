import "server-only";
import { one, query } from "@/lib/db";
import type { MlApi } from "./api";
import type { MlItem, MlOrder, MlQuestion } from "./types";

// Gravação dos dados do ML no banco. Usado pela sincronização e pelas notificações.

export function itemRow(accountId: string, i: MlItem) {
  return {
    id: i.id,
    account_id: accountId,
    title: i.title,
    price: i.price,
    available_quantity: i.available_quantity,
    sold_quantity: i.sold_quantity,
    status: i.status,
    listing_type_id: i.listing_type_id ?? null,
    category_id: i.category_id ?? null,
    thumbnail: i.thumbnail ?? null,
    permalink: i.permalink ?? null,
    logistic_type: i.shipping?.logistic_type ?? null,
    free_shipping: i.shipping?.free_shipping ?? false,
    health: i.health ?? null,
    catalog_listing: i.catalog_listing ?? false,
    catalog_product_id: i.catalog_product_id ?? null,
    pictures_count: i.pictures ? i.pictures.length : null,
    listed_at: i.date_created ?? i.start_time ?? null,
    updated_at: new Date().toISOString(),
  };
}

const ITEM_COLUMNS = Object.keys(itemRow("", { id: "", title: "", price: 0, available_quantity: 0, sold_quantity: 0, status: "" }));

export async function upsertItems(accountId: string, items: MlItem[]) {
  const cols = ITEM_COLUMNS.join(", ");
  const updates = ITEM_COLUMNS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  for (let i = 0; i < items.length; i += 500) {
    await query(
      `insert into items (${cols}) select ${cols} from json_populate_recordset(null::items, $1)
       on conflict (id) do update set ${updates}`,
      [JSON.stringify(items.slice(i, i + 500).map((it) => itemRow(accountId, it)))],
    );
  }
}

/** Frete pago pelo vendedor. Falha silenciosa: sem o custo, o lucro só fica menos preciso. */
async function sellerShippingCost(api: MlApi, order: MlOrder, sellerId: number): Promise<number | null> {
  if (!order.shipping?.id) return 0;
  try {
    const costs = await api.shipmentCosts(order.shipping.id);
    return costs.senders?.find((s) => s.user_id === sellerId)?.cost ?? 0;
  } catch {
    return null;
  }
}

export async function upsertOrder(api: MlApi, accountId: string, sellerId: number, order: MlOrder) {
  const existing = await one<{ shipping_cost: number | null }>("select shipping_cost from orders where id = $1", [order.id]);
  const shippingCost = existing?.shipping_cost != null ? existing.shipping_cost : await sellerShippingCost(api, order, sellerId);

  await query(
    `insert into orders (id, account_id, status, date_created, total_amount, shipping_id, shipping_cost, buyer_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set status = excluded.status, total_amount = excluded.total_amount,
       shipping_cost = excluded.shipping_cost, updated_at = now()`,
    [order.id, accountId, order.status, order.date_created, order.total_amount, order.shipping?.id ?? null, shippingCost, order.buyer?.id ?? null],
  );
  const lines = order.order_items.map((l) => ({
    order_id: order.id,
    item_id: l.item.id,
    title: l.item.title,
    quantity: l.quantity,
    unit_price: l.unit_price,
    sale_fee: l.sale_fee ?? 0,
  }));
  await query(
    `insert into order_items select * from json_populate_recordset(null::order_items, $1)
     on conflict (order_id, item_id) do update set quantity = excluded.quantity, unit_price = excluded.unit_price,
       sale_fee = excluded.sale_fee, title = excluded.title`,
    [JSON.stringify(lines)],
  );
  return { isNew: !existing };
}

export async function upsertQuestion(accountId: string, q: MlQuestion) {
  const rows = await query<{ inserted: boolean }>(
    `insert into questions (id, account_id, item_id, text, status, answer, date_created)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set status = excluded.status, answer = excluded.answer
     returning (xmax = 0) as inserted`,
    [q.id, accountId, q.item_id, q.text, q.status, q.answer?.text ?? null, q.date_created],
  );
  return { isNew: rows[0]?.inserted ?? false };
}

export interface NewEvent {
  kind: "order" | "question" | "item_change" | "alert";
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body?: string;
  itemId?: string;
  dedupeKey?: string;
}

export async function pushEvents(accountId: string, events: NewEvent[]) {
  if (!events.length) return;
  const rows = events.map((e) => ({
    account_id: accountId,
    kind: e.kind,
    severity: e.severity ?? "info",
    title: e.title,
    body: e.body ?? null,
    item_id: e.itemId ?? null,
    dedupe_key: e.dedupeKey ?? null,
  }));
  await query(
    `insert into events (account_id, kind, severity, title, body, item_id, dedupe_key)
     select account_id, kind, severity, title, body, item_id, dedupe_key from json_populate_recordset(null::events, $1)
     on conflict (account_id, dedupe_key) do nothing`,
    [JSON.stringify(rows)],
  );
}

export async function saveVisits(itemId: string, daily: { day: string; visits: number }[]) {
  if (!daily.length) return;
  await query(
    `insert into item_visits_daily (item_id, day, visits)
     select $1, (d->>'day')::date, (d->>'visits')::int from json_array_elements($2::json) d
     on conflict (item_id, day) do update set visits = excluded.visits`,
    [itemId, JSON.stringify(daily)],
  );
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
