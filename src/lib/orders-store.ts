import "server-only";
import { query } from "@/lib/db";

// Gravação de pedidos já convertidos (Shopee e Amazon). Uma taxa zero não apaga a já gravada:
// o extrato com as taxas nem sempre vem na mesma leitura do pedido.

export interface StoredOrder {
  id: string;
  status: string;
  date_created: string;
  total_amount: number;
  shipping_cost: number | null;
  buyer_id: number | null;
  lines: { item_id: string; title: string; quantity: number; unit_price: number; sale_fee: number }[];
}

export async function saveOrders(accountId: string, orders: StoredOrder[]) {
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
