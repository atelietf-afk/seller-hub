import "server-only";
import { adminClient } from "@/lib/supabase/admin";
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
    updated_at: new Date().toISOString(),
  };
}

export async function upsertItems(accountId: string, items: MlItem[]) {
  for (let i = 0; i < items.length; i += 500) {
    const { error } = await adminClient()
      .from("items")
      .upsert(items.slice(i, i + 500).map((it) => itemRow(accountId, it)));
    if (error) throw error;
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
  const db = adminClient();
  const { data: existing } = await db.from("orders").select("shipping_cost").eq("id", order.id).maybeSingle();
  const shippingCost =
    existing?.shipping_cost != null ? existing.shipping_cost : await sellerShippingCost(api, order, sellerId);

  const { error } = await db.from("orders").upsert({
    id: order.id,
    account_id: accountId,
    status: order.status,
    date_created: order.date_created,
    total_amount: order.total_amount,
    shipping_id: order.shipping?.id ?? null,
    shipping_cost: shippingCost,
    buyer_id: order.buyer?.id ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  const lines = order.order_items.map((l) => ({
    order_id: order.id,
    item_id: l.item.id,
    title: l.item.title,
    quantity: l.quantity,
    unit_price: l.unit_price,
    sale_fee: l.sale_fee ?? 0,
  }));
  const { error: linesError } = await db.from("order_items").upsert(lines);
  if (linesError) throw linesError;
  return { isNew: !existing };
}

export async function upsertQuestion(accountId: string, q: MlQuestion) {
  const { data: existing } = await adminClient().from("questions").select("id").eq("id", q.id).maybeSingle();
  const { error } = await adminClient()
    .from("questions")
    .upsert({
      id: q.id,
      account_id: accountId,
      item_id: q.item_id,
      text: q.text,
      status: q.status,
      answer: q.answer?.text ?? null,
      date_created: q.date_created,
    });
  if (error) throw error;
  return { isNew: !existing };
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
  const { error } = await adminClient()
    .from("events")
    .upsert(
      events.map((e) => ({
        account_id: accountId,
        kind: e.kind,
        severity: e.severity ?? "info",
        title: e.title,
        body: e.body ?? null,
        item_id: e.itemId ?? null,
        dedupe_key: e.dedupeKey ?? null,
      })),
      { onConflict: "account_id,dedupe_key", ignoreDuplicates: true },
    );
  if (error) throw error;
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
