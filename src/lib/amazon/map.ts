// Converte respostas da Amazon para o formato comum do Seller Hub.

type Money = { amount?: string | number; currencyCode?: string };

export interface AmazonOrder {
  orderId: string;
  createdTime: string;
  fulfillment?: { fulfillmentStatus?: string };
  orderItems?: {
    orderItemId?: string;
    product?: { asin?: string; sellerSku?: string; title?: string };
    quantityOrdered?: number;
    proceeds?: { breakdowns?: { type?: string; subtotal?: Money }[] };
  }[];
}

/** Anúncios da Amazon: prefixo AMZ + SKU do vendedor (é o que liga pedido, taxa e anúncio). */
export const amazonItemId = (sku: string) => `AMZ${sku}`;

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) || 0 : 0);
const round = (n: number) => Math.round(n * 100) / 100;

export function mapAmazonStatus(s: string | undefined): string {
  const v = (s ?? "").toLowerCase().replace(/[_\s]/g, "");
  if (v.includes("cancel")) return "cancelled";
  if (v.includes("pending")) return "payment_required";
  return "paid";
}

export interface MappedAmazonOrder {
  id: string;
  status: string;
  date_created: string;
  total_amount: number;
  shipping_cost: number;
  buyer_id: null;
  lines: { item_id: string; title: string; quantity: number; unit_price: number; sale_fee: number }[];
}

/** Pedido no formato comum. A taxa vem depois, do extrato (Finances), e o frete do FBA entra nela. */
export function mapAmazonOrder(o: AmazonOrder, fees?: Map<string, number>): MappedAmazonOrder {
  const byItem = new Map<string, { title: string; quantity: number; revenue: number }>();
  for (const it of o.orderItems ?? []) {
    const sku = it.product?.sellerSku ?? it.product?.asin ?? it.orderItemId ?? "?";
    const id = amazonItemId(sku);
    const qty = it.quantityOrdered ?? 0;
    const sub = it.proceeds?.breakdowns?.find((b) => b.type === "ITEM")?.subtotal;
    const cur = byItem.get(id) ?? { title: it.product?.title ?? it.product?.asin ?? sku, quantity: 0, revenue: 0 };
    cur.quantity += qty;
    cur.revenue += num(sub?.amount);
    byItem.set(id, cur);
  }
  const lines = [...byItem.entries()]
    .filter(([, l]) => l.quantity > 0)
    .map(([item_id, l]) => ({
      item_id,
      title: l.title,
      quantity: l.quantity,
      unit_price: round(l.revenue / l.quantity),
      sale_fee: round((fees?.get(item_id) ?? 0) / l.quantity),
    }));
  return {
    id: o.orderId,
    status: mapAmazonStatus(o.fulfillment?.fulfillmentStatus),
    date_created: new Date(o.createdTime).toISOString(),
    total_amount: round(lines.reduce((a, l) => a + l.unit_price * l.quantity, 0)),
    shipping_cost: 0,
    buyer_id: null,
    lines,
  };
}

export interface FinancialEvents {
  ShipmentEventList?: {
    ShipmentItemList?: { SellerSKU?: string; ItemFeeList?: { FeeType?: string; FeeAmount?: { CurrencyAmount?: number } }[] }[];
  }[];
}

/** Taxas do pedido por anúncio (comissão, FBA etc. somadas, em valor positivo). */
export function feesBySku(ev: FinancialEvents): Map<string, number> {
  const out = new Map<string, number>();
  for (const shipment of ev.ShipmentEventList ?? []) {
    for (const item of shipment.ShipmentItemList ?? []) {
      if (!item.SellerSKU) continue;
      const fee = (item.ItemFeeList ?? []).reduce((a, f) => a + Math.abs(f.FeeAmount?.CurrencyAmount ?? 0), 0);
      const id = amazonItemId(item.SellerSKU);
      out.set(id, round((out.get(id) ?? 0) + fee));
    }
  }
  return out;
}

/** Relatório GET_MERCHANT_LISTINGS_ALL_DATA (texto separado por tabulação, com cabeçalho). */
export function parseListingsReport(tsv: string) {
  const [head, ...rows] = tsv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!head) return [];
  const cols = head.split("\t").map((c) => c.trim().toLowerCase());
  const at = (r: string[], name: string) => {
    const i = cols.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  return rows
    .map((line) => line.split("\t"))
    .filter((r) => at(r, "seller-sku"))
    .map((r) => {
      const asin = at(r, "asin1");
      const status = at(r, "status").toLowerCase();
      const opened = Date.parse(at(r, "open-date").replace(/ [A-Z]{3,4}$/, ""));
      return {
        id: amazonItemId(at(r, "seller-sku")),
        title: at(r, "item-name") || asin,
        price: num(at(r, "price")),
        available_quantity: Math.trunc(num(at(r, "quantity"))),
        sold_quantity: 0,
        status: status === "active" ? "active" : status === "inactive" ? "paused" : "closed",
        thumbnail: at(r, "image-url") || undefined,
        permalink: asin ? `https://www.amazon.com.br/dp/${asin}` : undefined,
        date_created: Number.isFinite(opened) ? new Date(opened).toISOString() : undefined,
        shipping: { logistic_type: at(r, "fulfillment-channel").toUpperCase().startsWith("AMAZON") ? "fba" : "merchant" },
      };
    });
}
