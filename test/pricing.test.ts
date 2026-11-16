import { describe, expect, it } from "vitest";
import { minimumPrice, profitAtPrice, type PricingInput } from "@/lib/analytics/pricing";

const base: PricingInput = { cost: 20, shippingCost: 0, taxRate: 0.06, fees: { commission: 0.14, fixedFee: 0 }, targetMargin: 0.2 };

describe("preço mínimo por loja", () => {
  it("chega à margem desejada", () => {
    const price = minimumPrice(base)!;
    const { margin } = profitAtPrice(price, base);
    expect(margin).toBeGreaterThanOrEqual(0.2 - 0.001);
    expect(margin).toBeLessThan(0.2 + 0.01);
  });

  it("soma taxa fixa e frete ao custo", () => {
    const price = minimumPrice({ ...base, shippingCost: 10, fees: { commission: 0.14, fixedFee: 4 } })!;
    expect(profitAtPrice(price, { ...base, shippingCost: 10, fees: { commission: 0.14, fixedFee: 4 } }).margin).toBeCloseTo(0.2, 2);
  });

  it("não fecha quando comissão, imposto e margem passam de 100%", () => {
    expect(minimumPrice({ ...base, fees: { commission: 0.7, fixedFee: 0 }, targetMargin: 0.3 })).toBeNull();
  });

  it("margem maior exige preço maior", () => {
    expect(minimumPrice({ ...base, targetMargin: 0.3 })!).toBeGreaterThan(minimumPrice(base)!);
  });
});
