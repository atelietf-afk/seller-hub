import { describe, expect, it } from "vitest";
import { feesBySku, mapAmazonOrder, mapAmazonStatus, parseListingsReport } from "@/lib/amazon/map";
import { amazonConsentUrl } from "@/lib/amazon/lwa";

describe("pedidos da Amazon", () => {
  const order = {
    orderId: "701-1234567-1234567",
    createdTime: "2026-10-27T15:00:00Z",
    fulfillment: { fulfillmentStatus: "Shipped" },
    orderItems: [
      {
        orderItemId: "1",
        product: { asin: "B0AAA", sellerSku: "CANECA-01", title: "Caneca" },
        quantityOrdered: 2,
        proceeds: { breakdowns: [{ type: "ITEM", subtotal: { amount: "99.80", currencyCode: "BRL" } }] },
      },
      {
        orderItemId: "2",
        product: { asin: "B0AAA", sellerSku: "CANECA-01", title: "Caneca" },
        quantityOrdered: 1,
        proceeds: { breakdowns: [{ type: "ITEM", subtotal: { amount: "49.90" } }] },
      },
      { orderItemId: "3", product: { asin: "B0BBB", sellerSku: "ALM-02" }, quantityOrdered: 0 },
    ],
  };

  it("junta linhas do mesmo SKU, usa o valor do item e ignora quantidade zero", () => {
    const m = mapAmazonOrder(order);
    expect(m).toMatchObject({ id: "701-1234567-1234567", status: "paid", total_amount: 149.7, shipping_cost: 0 });
    expect(m.lines).toEqual([{ item_id: "AMZCANECA-01", title: "Caneca", quantity: 3, unit_price: 49.9, sale_fee: 0 }]);
  });

  it("aplica as taxas do extrato por unidade", () => {
    const fees = feesBySku({
      ShipmentEventList: [
        {
          ShipmentItemList: [
            {
              SellerSKU: "CANECA-01",
              ItemFeeList: [
                { FeeType: "Commission", FeeAmount: { CurrencyAmount: -18 } },
                { FeeType: "FBAPerUnitFulfillmentFee", FeeAmount: { CurrencyAmount: -12 } },
              ],
            },
          ],
        },
      ],
    });
    expect(fees.get("AMZCANECA-01")).toBe(30);
    expect(mapAmazonOrder(order, fees).lines[0].sale_fee).toBe(10);
  });

  it("situações", () => {
    expect(mapAmazonStatus("Canceled")).toBe("cancelled");
    expect(mapAmazonStatus("CANCELLED")).toBe("cancelled");
    expect(mapAmazonStatus("Pending")).toBe("payment_required");
    expect(mapAmazonStatus("PartiallyShipped")).toBe("paid");
    expect(mapAmazonStatus("Unshipped")).toBe("paid");
  });
});

describe("relatório de anúncios", () => {
  it("lê pelo nome das colunas e marca FBA", () => {
    const tsv = [
      "item-name\tseller-sku\tprice\tquantity\topen-date\timage-url\tasin1\tfulfillment-channel\tstatus",
      "Caneca Personalizada\tCANECA-01\t49.90\t12\t2026-10-20 10:00:00 BRT\t\tB0AAA\tDEFAULT\tActive",
      "Almofada\tALM-02\t89.90\t\t2025-01-02 08:00:00 BRT\thttps://img/a.jpg\tB0BBB\tAMAZON_NA\tInactive",
      "",
    ].join("\n");
    const rows = parseListingsReport(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "AMZCANECA-01",
      title: "Caneca Personalizada",
      price: 49.9,
      available_quantity: 12,
      status: "active",
      permalink: "https://www.amazon.com.br/dp/B0AAA",
      shipping: { logistic_type: "merchant" },
    });
    expect(rows[0].date_created?.slice(0, 10)).toBe("2026-10-20");
    expect(rows[1]).toMatchObject({
      id: "AMZALM-02",
      available_quantity: 0,
      status: "paused",
      thumbnail: "https://img/a.jpg",
      shipping: { logistic_type: "fba" },
    });
  });
});

describe("autorização", () => {
  it("monta o link da Central do Vendedor (version=beta só em rascunho)", () => {
    const u = new URL(
      amazonConsentUrl(
        { sellerCentral: "https://sellercentral.amazon.com.br", appId: "amzn1.sp.solution.x", draft: true },
        "st",
        "https://h/api/amazon/callback",
      ),
    );
    expect(u.origin + u.pathname).toBe("https://sellercentral.amazon.com.br/apps/authorize/consent");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      application_id: "amzn1.sp.solution.x",
      state: "st",
      redirect_uri: "https://h/api/amazon/callback",
      version: "beta",
    });
    expect(new URL(amazonConsentUrl({ sellerCentral: "https://s", appId: "a", draft: false }, "st", "r")).searchParams.has("version")).toBe(
      false,
    );
  });
});
