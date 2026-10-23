import { describe, expect, it } from "vitest";
import { lineProfit, sumProfits } from "@/lib/analytics/profit";

const line = { orderId: 1, itemId: "MLB1", quantity: 2, unitPrice: 100, saleFee: 14, orderShippingCost: 20, orderTotal: 200 };

describe("lineProfit", () => {
  it("desconta comissão, frete, imposto e custo", () => {
    const p = lineProfit(line, { unitCost: 40, extraCost: 2 }, 0.06);
    expect(p).toMatchObject({ revenue: 200, fees: 28, shipping: 20, tax: 12, productCost: 84, profit: 56, hasCost: true });
    expect(p.margin).toBeCloseTo(0.28);
  });

  it("rateia o frete do pedido pelo valor de cada linha", () => {
    const p = lineProfit({ ...line, quantity: 1, orderTotal: 400 }, undefined, 0);
    expect(p.shipping).toBe(5); // 100 de 400 → 25% de 20
  });

  it("marca quando não há custo informado", () => {
    expect(lineProfit(line, undefined, 0.06).hasCost).toBe(false);
    expect(lineProfit(line, { unitCost: 0, extraCost: 0 }, 0.06).hasCost).toBe(false);
  });
});

describe("sumProfits", () => {
  it("soma as linhas e recalcula a margem", () => {
    const a = lineProfit(line, { unitCost: 40, extraCost: 2 }, 0.06);
    const b = lineProfit({ ...line, orderId: 2 }, { unitCost: 40, extraCost: 2 }, 0.06);
    const t = sumProfits([a, b]);
    expect(t.revenue).toBe(400);
    expect(t.profit).toBe(112);
    expect(t.margin).toBeCloseTo(0.28);
  });

  it("não divide por zero sem vendas", () => {
    expect(sumProfits([])).toMatchObject({ revenue: 0, margin: 0, hasCost: false });
  });
});
