import { describe, expect, it, vi } from "vitest";
import { MlApi } from "@/lib/ml/api";
import { listingFromProduct, MlSpyApi, parseCompetition } from "@/lib/ml/spy-api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("MlSpyApi", () => {
  it("lê tendências na ordem e os mais vendidos com tipo", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/trends/MLB/MLB1")) return json([{ keyword: "fone bluetooth", url: "x" }, { keyword: "fone jbl" }]);
      return json({ content: [{ id: "MLB9", position: 1, type: "ITEM" }, { id: "MLB777", position: 2, type: "PRODUCT" }] });
    });
    const spy = new MlSpyApi(new MlApi(async () => "t", fetchFn as typeof fetch));
    expect(await spy.trends("MLB", "MLB1")).toEqual([
      { keyword: "fone bluetooth", position: 1 },
      { keyword: "fone jbl", position: 2 },
    ]);
    expect(await spy.highlights("MLB", "MLB1")).toEqual([
      { id: "MLB9", position: 1, kind: "ITEM" },
      { id: "MLB777", position: 2, kind: "PRODUCT" },
    ]);
  });

  it("disputa de catálogo indisponível vira null", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 404 }));
    expect(await new MlSpyApi(new MlApi(async () => "t", fetchFn as typeof fetch)).priceToWin("MLB1")).toBeNull();
  });
});

describe("leitura de respostas", () => {
  it("produto de catálogo usa o vencedor da vitrine", () => {
    const l = listingFromProduct({
      id: "MLB777",
      name: "Fone X",
      pictures: [{ url: "http://img" }],
      buy_box_winner: { price: 99.9, seller_id: 5, shipping: { free_shipping: true, logistic_type: "fulfillment" } },
    });
    expect(l).toMatchObject({ id: "MLB777", title: "Fone X", price: 99.9, sellerId: 5, freeShipping: true, logisticType: "fulfillment", thumbnail: "http://img" });
    expect(l.permalink).toContain("/p/MLB777");
  });

  it("disputa de catálogo com vencedor e motivos", () => {
    expect(
      parseCompetition({ status: "competing", current_price: 120, price_to_win: 109.9, winner: { item_id: "MLB2", price: 110 }, reason: ["shipping_not_free"] }),
    ).toEqual({ status: "competing", price: 120, priceToWin: 109.9, winnerItemId: "MLB2", winnerPrice: 110, reasons: ["shipping_not_free"] });
  });
});
