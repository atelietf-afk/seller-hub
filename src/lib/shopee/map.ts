// Converte as respostas da Shopee para o formato comum do Seller Hub (o mesmo do ML).

export interface ShopeeItemBase {
  item_id: number;
  item_name: string;
  item_status: string; // NORMAL | UNLIST | BANNED | REVIEWING | SELLER_DELETE...
  category_id?: number;
  create_time?: number; // unix
  price_info?: { current_price: number }[];
  stock_info_v2?: { summary_info?: { total_available_stock?: number } };
  image?: { image_url_list?: string[] };
  has_model?: boolean;
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string; // UNPAID | READY_TO_SHIP | PROCESSED | SHIPPED | TO_CONFIRM_RECEIVE | COMPLETED | IN_CANCEL | CANCELLED | TO_RETURN
  create_time: number; // unix
  total_amount?: number;
  buyer_user_id?: number;
  item_list?: { item_id: number; item_name: string; model_quantity_purchased: number; model_discounted_price: number }[];
}

export interface ShopeeEscrow {
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  actual_shipping_fee?: number;
  shopee_shipping_rebate?: number;
  buyer_paid_shipping_fee?: number;
}

/** Anúncios da Shopee ganham o prefixo SHP para não se misturar com os do ML. */
export const shopeeItemId = (itemId: number | string) => `SHP${itemId}`;

const ITEM_STATUS: Record<string, string> = { NORMAL: "active", UNLIST: "paused" };

export function mapItem(i: ShopeeItemBase, shopId: number, model?: { price: number; stock: number }) {
  return {
    id: shopeeItemId(i.item_id),
    title: i.item_name,
    price: model?.price ?? i.price_info?.[0]?.current_price ?? 0,
    available_quantity: model?.stock ?? i.stock_info_v2?.summary_info?.total_available_stock ?? 0,
    sold_quantity: 0,
    status: ITEM_STATUS[i.item_status] ?? "closed",
    category_id: i.category_id != null ? `SHP${i.category_id}` : undefined,
    thumbnail: i.image?.image_url_list?.[0],
    permalink: `https://shopee.com.br/product/${shopId}/${i.item_id}`,
    date_created: i.create_time ? new Date(i.create_time * 1000).toISOString() : undefined,
  };
}

/** Variações: menor preço e estoque somado. */
export function summarizeModels(models: { price_info?: { current_price: number }[]; stock_info_v2?: { summary_info?: { total_available_stock?: number } } }[]) {
  const prices = models.map((m) => m.price_info?.[0]?.current_price).filter((p): p is number => typeof p === "number" && p > 0);
  return {
    price: prices.length ? Math.min(...prices) : 0,
    stock: models.reduce((a, m) => a + (m.stock_info_v2?.summary_info?.total_available_stock ?? 0), 0),
  };
}

/** Situação no vocabulário do Seller Hub: só "paid" entra no faturamento. */
export function mapOrderStatus(s: string): string {
  if (s === "UNPAID") return "payment_required";
  if (s === "CANCELLED") return "cancelled";
  if (s === "IN_CANCEL") return "pending_cancel";
  return "paid";
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface MappedOrder {
  id: string;
  status: string;
  date_created: string;
  total_amount: number;
  /** Frete pago pelo vendedor. null enquanto a Shopee não fechou os valores do pedido. */
  shipping_cost: number | null;
  buyer_id: number | null;
  lines: { item_id: string; title: string; quantity: number; unit_price: number; sale_fee: number }[];
}

/**
 * Pedido com as taxas do extrato (escrow): comissão + serviço + transação viram a
 * "comissão por unidade" de cada linha, rateada pelo valor. Variações do mesmo
 * anúncio viram uma linha só (quantidade somada, preço médio).
 */
export function mapOrder(o: ShopeeOrderDetail, escrow: ShopeeEscrow | null): MappedOrder {
  const byItem = new Map<string, { title: string; quantity: number; revenue: number }>();
  for (const l of o.item_list ?? []) {
    const id = shopeeItemId(l.item_id);
    const cur = byItem.get(id) ?? { title: l.item_name, quantity: 0, revenue: 0 };
    cur.quantity += l.model_quantity_purchased;
    cur.revenue += l.model_discounted_price * l.model_quantity_purchased;
    byItem.set(id, cur);
  }
  const total = [...byItem.values()].reduce((a, l) => a + l.revenue, 0);
  const fees = escrow ? (escrow.commission_fee ?? 0) + (escrow.service_fee ?? 0) + (escrow.seller_transaction_fee ?? 0) : 0;
  const shipping = escrow
    ? Math.max(0, (escrow.actual_shipping_fee ?? 0) - (escrow.shopee_shipping_rebate ?? 0) - (escrow.buyer_paid_shipping_fee ?? 0))
    : null;
  return {
    id: o.order_sn,
    status: mapOrderStatus(o.order_status),
    date_created: new Date(o.create_time * 1000).toISOString(),
    total_amount: o.total_amount ?? round(total),
    shipping_cost: shipping === null ? null : round(shipping),
    buyer_id: o.buyer_user_id ?? null,
    lines: [...byItem.entries()].map(([item_id, l]) => ({
      item_id,
      title: l.title,
      quantity: l.quantity,
      unit_price: round(l.revenue / l.quantity),
      sale_fee: total > 0 ? round((fees * (l.revenue / total)) / l.quantity) : 0,
    })),
  };
}

/** Janelas de até 15 dias (limite da busca de pedidos da Shopee), da mais nova para a mais antiga. */
export function orderWindows(from: Date, to: Date, maxDays = 15): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const step = maxDays * 86_400;
  let end = Math.floor(to.getTime() / 1000);
  const start = Math.floor(from.getTime() / 1000);
  while (end > start) {
    const begin = Math.max(start, end - step + 1);
    out.push({ from: begin, to: end });
    end = begin - 1;
  }
  return out;
}
