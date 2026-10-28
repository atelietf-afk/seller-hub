import { describe, expect, it } from "vitest";
import { mapItem, mapOrder, mapOrderStatus, orderWindows, summarizeModels } from "@/lib/shopee/map";

describe("anúncios da Shopee", () => {
  it("converte para o formato comum com prefixo SHP", () => {
    expect(
      mapItem(
        {
          item_id: 123,
          item_name: "Caneca",
          item_status: "NORMAL",
          category_id: 99,
          create_time: 1761609600,
          price_info: [{ current_price: 39.9 }],
          stock_info_v2: { summary_info: { total_available_stock: 7 } },
          image: { image_url_list: ["https://img/1.jpg"] },
        },
        55,
      ),
    ).toEqual({
      id: "SHP123",
      title: "Caneca",
      price: 39.9,
      available_quantity: 7,
      sold_quantity: 0,
      status: "active",
      category_id: "SHP99",
      thumbnail: "https://img/1.jpg",
      permalink: "https://shopee.com.br/product/55/123",
      date_created: "2025-10-28T00:00:00.000Z",
    });
    expect(mapItem({ item_id: 1, item_name: "x", item_status: "UNLIST" }, 55).status).toBe("paused");
    expect(mapItem({ item_id: 1, item_name: "x", item_status: "BANNED" }, 55).status).toBe("closed");
  });

  it("variações: menor preço e estoque somado", () => {
    const m = summarizeModels([
      { price_info: [{ current_price: 50 }], stock_info_v2: { summary_info: { total_available_stock: 3 } } },
      { price_info: [{ current_price: 45 }], stock_info_v2: { summary_info: { total_available_stock: 4 } } },
    ]);
    expect(m).toEqual({ price: 45, stock: 7 });
    expect(mapItem({ item_id: 1, item_name: "x", item_status: "NORMAL", has_model: true }, 55, m)).toMatchObject({ price: 45, available_quantity: 7 });
  });
});

describe("pedidos da Shopee", () => {
  const order = {
    order_sn: "251028ABCD",
    order_status: "COMPLETED",
    create_time: 1761609600,
    total_amount: 150,
    buyer_user_id: 9,
    item_list: [
      { item_id: 1, item_name: "Caneca", model_quantity_purchased: 1, model_discounted_price: 40 },
      { item_id: 1, item_name: "Caneca", model_quantity_purchased: 1, model_discounted_price: 60 }, // outra variação
      { item_id: 2, item_name: "Almofada", model_quantity_purchased: 1, model_discounted_price: 50 },
    ],
  };

  it("junta variações, rateia as taxas pelo valor e calcula o frete do vendedor", () => {
    const m = mapOrder(order, { commission_fee: 21, service_fee: 6, seller_transaction_fee: 3, actual_shipping_fee: 20, shopee_shipping_rebate: 12, buyer_paid_shipping_fee: 5 });
    expect(m).toMatchObject({ id: "251028ABCD", status: "paid", total_amount: 150, shipping_cost: 3, buyer_id: 9 });
    expect(m.date_created).toBe("2025-10-28T00:00:00.000Z");
    // taxas 30: caneca 100 de 150 → 20 em 2 unidades = 10 por unidade; almofada 10
    expect(m.lines).toEqual([
      { item_id: "SHP1", title: "Caneca", quantity: 2, unit_price: 50, sale_fee: 10 },
      { item_id: "SHP2", title: "Almofada", quantity: 1, unit_price: 50, sale_fee: 10 },
    ]);
  });

  it("sem extrato ainda: taxa zero e frete desconhecido", () => {
    const m = mapOrder(order, null);
    expect(m.shipping_cost).toBeNull();
    expect(m.lines.every((l) => l.sale_fee === 0)).toBe(true);
  });

  it("situações", () => {
    expect(mapOrderStatus("UNPAID")).toBe("payment_required");
    expect(mapOrderStatus("CANCELLED")).toBe("cancelled");
    expect(mapOrderStatus("IN_CANCEL")).toBe("pending_cancel");
    expect(mapOrderStatus("READY_TO_SHIP")).toBe("paid");
    expect(mapOrderStatus("TO_RETURN")).toBe("paid");
  });
});

describe("orderWindows", () => {
  it("quebra o período em janelas de até 15 dias, sem sobrepor", () => {
    const to = new Date("2026-10-28T00:00:00Z");
    const w = orderWindows(new Date(to.getTime() - 40 * 86_400_000), to);
    expect(w).toHaveLength(3);
    expect(w[0].to).toBe(to.getTime() / 1000);
    for (const x of w) expect(x.to - x.from).toBeLessThan(15 * 86_400);
    for (let i = 1; i < w.length; i++) expect(w[i].to).toBe(w[i - 1].from - 1);
    expect(w.at(-1)!.from).toBe(to.getTime() / 1000 - 40 * 86_400);
  });
});
