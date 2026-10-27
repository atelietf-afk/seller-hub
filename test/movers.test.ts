import { describe, expect, it } from "vitest";
import { computeMovers } from "@/lib/analytics/movers";

const s = (itemId: string, revenue: number) => ({ itemId, title: itemId, revenue });

describe("computeMovers", () => {
  it("ordena pela variação em reais, não em porcentagem", () => {
    const r = computeMovers([s("A", 2000), s("B", 300), s("C", 100), s("D", 0)], [s("A", 1000), s("B", 100), s("C", 900), s("D", 400)]);
    expect(r.up.map((m) => m.itemId)).toEqual(["A", "B"]);
    expect(r.down.map((m) => m.itemId)).toEqual(["C", "D"]);
    expect(r.up[0].change).toBeCloseTo(1);
    expect(r.down[1]).toMatchObject({ revenue: 0, prevRevenue: 400, change: -1 });
  });

  it("produto novo sobe; ruído de centavos é ignorado", () => {
    const r = computeMovers([s("novo", 500), s("ruido", 30)], [s("velho", 5000), s("ruido", 10)]);
    expect(r.up.map((m) => m.itemId)).toEqual(["novo"]);
  });
});
