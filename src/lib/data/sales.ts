import "server-only";
import type { SaleOrder } from "@/lib/analytics/today";
import { query } from "@/lib/db";

/** Pedidos da conta entre [from, to], com produtos e custos. Só devolve se a conta for do usuário. */
export function ordersWithLines(ownerId: string, accountId: string, from: Date, to: Date) {
  return query<SaleOrder>(
    `select o.id, o.status, o.date_created, o.shipping_cost,
       coalesce(json_agg(json_build_object(
         'item_id', oi.item_id, 'title', oi.title, 'thumbnail', i.thumbnail, 'quantity', oi.quantity,
         'unit_price', oi.unit_price, 'sale_fee', oi.sale_fee, 'unit_cost', c.unit_cost, 'extra_cost', c.extra_cost
       ) order by oi.item_id) filter (where oi.order_id is not null), '[]') as lines
     from orders o
     join ml_accounts a on a.id = o.account_id and a.owner_id = $2
     left join order_items oi on oi.order_id = o.id
     left join items i on i.id = oi.item_id
     left join product_costs c on c.item_id = oi.item_id
     where o.account_id = $1 and o.date_created >= $3 and o.date_created <= $4
     group by o.id
     order by o.date_created desc`,
    [accountId, ownerId, from.toISOString(), to.toISOString()],
  );
}
