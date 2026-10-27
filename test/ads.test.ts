import { describe, expect, it } from "vitest";
import { adsTotals, diagnoseAd, tacos } from "@/lib/analytics/ads";
import { parseDaily, readMetrics, toFraction } from "@/lib/ml/ads-api";

const m = (over = {}) => ({ clicks: 100, prints: 10_000, cost: 50, revenue: 500, units: 5, ...over });
const codes = (d: ReturnType<typeof diagnoseAd>) => d.map((x) => x.code);

describe("adsTotals", () => {
  it("soma e calcula ACOS, ROAS, CTR, CPC e conversão", () => {
    const t = adsTotals([m(), m({ cost: 150, revenue: 500 })]);
    expect(t).toMatchObject({ cost: 200, revenue: 1000, clicks: 200, units: 10 });
    expect(t.acos).toBeCloseTo(0.2);
    expect(t.roas).toBeCloseTo(5);
    expect(t.ctr).toBeCloseTo(0.01);
    expect(t.cpc).toBeCloseTo(1);
    expect(t.conversion).toBeCloseTo(0.05);
  });

  it("não divide por zero", () => {
    expect(adsTotals([])).toMatchObject({ acos: null, roas: null, ctr: null, cpc: null });
    expect(tacos(10, 0)).toBeNull();
    expect(tacos(10, 200)).toBeCloseTo(0.05);
  });
});

describe("diagnoseAd", () => {
  it("gasto sem venda é crítico", () => {
    expect(codes(diagnoseAd({ ...m({ revenue: 0, units: 0, cost: 40, clicks: 25 }), marginBeforeAds: 0.3 }))).toEqual(["spend_no_sales"]);
  });

  it("ACOS acima da margem dá prejuízo", () => {
    const d = diagnoseAd({ ...m({ cost: 200, revenue: 500 }), marginBeforeAds: 0.25 });
    expect(codes(d)).toEqual(["losing_money"]);
    expect(d[0].severity).toBe("critical");
  });

  it("ACOS bem abaixo da margem é oportunidade de escalar", () => {
    expect(codes(diagnoseAd({ ...m({ cost: 50, revenue: 1000 }), marginBeforeAds: 0.3 }))).toEqual(["scale"]);
  });

  it("sem custo cadastrado não julga a margem, mas usa o ACOS alvo", () => {
    expect(codes(diagnoseAd({ ...m({ cost: 100, revenue: 500 }), marginBeforeAds: null }))).toEqual(["ok"]);
    expect(codes(diagnoseAd({ ...m({ cost: 100, revenue: 500 }), marginBeforeAds: null, acosTarget: 0.1 }))).toEqual(["above_target"]);
  });

  it("CTR muito baixo com muita exibição", () => {
    expect(codes(diagnoseAd({ ...m({ clicks: 10, prints: 20_000 }), marginBeforeAds: null }))).toContain("low_ctr");
  });
});

describe("leitura da API de Product Ads", () => {
  it("lê métricas aninhadas ou no topo, somando direto + indireto quando não há total", () => {
    expect(readMetrics({ metrics: { clicks: 3, prints: 100, cost: 2.5, total_amount: 80, units_quantity: 2 } })).toEqual({
      clicks: 3,
      prints: 100,
      cost: 2.5,
      revenue: 80,
      units: 2,
    });
    expect(readMetrics({ clicks: "4", cost: 1, direct_amount: 30, indirect_amount: 20, direct_units_quantity: 1, indirect_units_quantity: 1 })).toMatchObject({
      clicks: 4,
      revenue: 50,
      units: 2,
    });
  });

  it("converte ACOS alvo em fração", () => {
    expect(toFraction(15)).toBeCloseTo(0.15);
    expect(toFraction(0.2)).toBeCloseTo(0.2);
    expect(toFraction(null)).toBeNull();
    expect(toFraction(0)).toBeNull();
  });

  it("lê métricas diárias nos dois formatos", () => {
    expect(parseDaily([{ campaign_id: 1, date: "2026-10-01T00:00:00", clicks: 2, cost: 1 }])).toEqual([
      { campaignId: 1, day: "2026-10-01", clicks: 2, prints: 0, cost: 1, revenue: 0, units: 0 },
    ]);
    expect(parseDaily([{ id: 7, metrics: [{ date: "2026-10-02", cost: 3 }, { date: "2026-10-03", cost: 4 }] }]).map((r) => [r.campaignId, r.day, r.cost])).toEqual([
      [7, "2026-10-02", 3],
      [7, "2026-10-03", 4],
    ]);
  });
});
