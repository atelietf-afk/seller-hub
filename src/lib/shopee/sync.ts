import "server-only";
import { one, query } from "@/lib/db";
import { brl } from "@/lib/format";
import { pushEvents, upsertItems } from "@/lib/ml/store";
import type { MlItem } from "@/lib/ml/types";
import { mapItem, mapOrder, orderWindows, summarizeModels, type MappedOrder, type ShopeeOrderDetail } from "./map";
import { ShopeeShop } from "./shop";
import { shopeeApiFor } from "./tokens";

const DAY = 86_400_000;
/** Pedidos atualizados nos últimos 15 dias são relidos a cada sincronização (pega cancelamentos). */
const RECENT_DAYS = 15;
/** Histórico buscado aos poucos, como no ML: suficiente para o mensal e a comparação. */
const HISTORY_DAYS = 120;
/** Extratos (taxas reais) por sincronização: uma chamada por pedido. */
const MAX_ESCROW = 80;
const MAX_MODEL_LOOKUPS = 150;

export interface ShopeeSyncResult {
  items: number;
  orders: number;
  newOrders: number;
  escrows: number;
  historySince: string;
  seconds: number;
}

interface Existing {
  id: string;
  status: string;
  shipping_cost: number | null;
}

async function saveOrders(accountId: string, orders: MappedOrder[]) {
  if (!orders.length) return;
  await query(
    `insert into orders (id, account_id, status, date_created, total_amount, shipping_cost, buyer_id)
     select o->>'id', $1::uuid, o->>'status', (o->>'date_created')::timestamptz, (o->>'total_amount')::numeric,
            (o->>'shipping_cost')::numeric, (o->>'buyer_id')::bigint
     from json_array_elements($2::json) o
     on conflict (id) do update set status = excluded.status, total_amount = excluded.total_amount,
       shipping_cost = coalesce(excluded.shipping_cost, orders.shipping_cost), updated_at = now()`,
    [accountId, JSON.stringify(orders)],
  );
  const lines = orders.flatMap((o) => o.lines.map((l) => ({ ...l, order_id: o.id })));
  await query(
    `insert into order_items (order_id, item_id, title, quantity, unit_price, sale_fee)
     select l->>'order_id', l->>'item_id', l->>'title', (l->>'quantity')::int, (l->>'unit_price')::numeric, (l->>'sale_fee')::numeric
     from json_array_elements($1::json) l
     on conflict (order_id, item_id) do update set quantity = excluded.quantity, unit_price = excluded.unit_price,
       -- sem extrato nesta leitura, mantém a taxa já gravada
       sale_fee = case when (excluded.sale_fee = 0) then order_items.sale_fee else excluded.sale_fee end`,
    [JSON.stringify(lines)],
  );
}

/** Sincroniza anúncios e pedidos de uma loja da Shopee. */
export async function syncShopee(accountId: string): Promise<ShopeeSyncResult> {
  const started = Date.now();
  const account = await one<{ ml_user_id: number; last_synced_at: string | null; orders_history_since: string | null }>(
    "select ml_user_id, last_synced_at, orders_history_since from ml_accounts where id = $1 and marketplace = 'shopee'",
    [accountId],
  );
  if (!account) throw new Error(`Conta ${accountId} não é da Shopee`);
  const shopId = Number(account.ml_user_id);
  const shop = new ShopeeShop(shopeeApiFor(accountId, shopId));

  // Anúncios
  const base = await shop.itemsBase(await shop.itemIds());
  let modelLookups = 0;
  const items = [];
  for (const b of base) {
    const model = b.has_model && modelLookups++ < MAX_MODEL_LOOKUPS ? summarizeModels(await shop.models(b.item_id)) : undefined;
    items.push(mapItem(b, shopId, model));
  }
  await upsertItems(accountId, items as unknown as MlItem[]);

  // Pedidos: recentes por atualização + uma janela de histórico por vez
  const now = new Date();
  const sns = new Set<string>();
  for (const w of orderWindows(new Date(now.getTime() - RECENT_DAYS * DAY), now)) {
    for (const sn of await shop.orderSns("update_time", w.from, w.to)) sns.add(sn);
  }
  let historySince = new Date(account.orders_history_since ?? now.getTime() - RECENT_DAYS * DAY);
  const historyLimit = new Date(now.getTime() - HISTORY_DAYS * DAY);
  if (historySince > historyLimit) {
    const from = new Date(Math.max(historyLimit.getTime(), historySince.getTime() - RECENT_DAYS * DAY));
    for (const w of orderWindows(from, historySince)) {
      for (const sn of await shop.orderSns("create_time", w.from, w.to)) sns.add(sn);
    }
    historySince = from;
  }

  const details: ShopeeOrderDetail[] = await shop.orderDetails([...sns]);
  const existing = new Map(
    (await query<Existing>("select id, status, shipping_cost from orders where account_id = $1 and id = any($2::text[])", [accountId, [...sns]])).map(
      (e) => [e.id, e],
    ),
  );
  // Extrato só quando muda algo: pedido novo, mudou de situação ou ainda sem taxas.
  let escrows = 0;
  const mapped: MappedOrder[] = [];
  for (const d of details) {
    const before = existing.get(d.order_sn);
    const status = mapOrder(d, null).status;
    const needsEscrow = status === "paid" && (!before || before.status !== status || before.shipping_cost === null) && escrows < MAX_ESCROW;
    let escrow = null;
    if (needsEscrow) {
      escrows++;
      escrow = await shop.escrow(d.order_sn).catch(() => null);
    }
    mapped.push(mapOrder(d, escrow));
  }
  await saveOrders(accountId, mapped);

  const fresh = mapped.filter((o) => !existing.has(o.id) && o.status === "paid" && new Date(o.date_created).getTime() > now.getTime() - 2 * DAY);
  await pushEvents(
    accountId,
    fresh.map((o) => ({
      kind: "order" as const,
      severity: "success" as const,
      title: `Nova venda na Shopee: ${brl(o.total_amount)}`,
      body: `${o.lines[0]?.quantity ?? 1}x ${o.lines[0]?.title ?? "produto"}`,
      itemId: o.lines[0]?.item_id,
      dedupeKey: `order:${o.id}`,
    })),
  );

  const info = await shop.shopInfo().catch(() => null);
  await query(
    `update ml_accounts set nickname = coalesce($2, nickname), last_synced_at = now(), orders_history_since = $3 where id = $1`,
    [accountId, info?.shop_name ?? null, historySince.toISOString()],
  );
  const result: ShopeeSyncResult = {
    items: items.length,
    orders: mapped.length,
    newOrders: mapped.filter((o) => !existing.has(o.id)).length,
    escrows,
    historySince: historySince.toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
  };
  await query("update ml_accounts set last_sync_result = $2 where id = $1", [accountId, JSON.stringify(result)]);
  console.info("Sincronização Shopee concluída", accountId, JSON.stringify(result));
  return result;
}
