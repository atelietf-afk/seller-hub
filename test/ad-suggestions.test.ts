import { describe, expect, it } from "vitest";
import { estimatedMargin, suggestCampaigns, type SuggestionItem } from "@/lib/analytics/ad-suggestions";

const now = new Date("2026-10-28T12:00:00Z");
const ctx = { now, minMargin: 0.1, cpc: 0.6, historyDays: 120 };
const item = (o: Partial<SuggestionItem>): SuggestionItem => ({
  itemId: "MLB1",
  title: "Produto",
  thumbnail: null,
  price: 100,
  status: "active",
  stock: 20,
  margin: 0.3,
  marginEstimated: false,
  units: 30,
  hiddenGem: false,
  listedAt: "2025-01-01T00:00:00Z",
  campaignName: null,
  adDecision: null,
  ...o,
});
const kinds = (items: SuggestionItem[]) => suggestCampaigns(items, ctx).suggestions.map((s) => [s.kind, s.items.map((i) => i.itemId)]);

describe("suggestCampaigns", () => {
  it("separa lançamentos, joias, campeões e estoque parado", () => {
    expect(
      kinds([
        item({ itemId: "NOVO", listedAt: "2026-10-20T00:00:00Z", units: 0, marginEstimated: true }),
        item({ itemId: "JOIA", hiddenGem: true, units: 4 }),
        item({ itemId: "CAMPEAO", units: 30 }),
        item({ itemId: "PARADO", units: 2, stock: 50 }), // 2 em 120 dias: estoque para 3000 dias
      ]),
    ).toEqual([
      ["lancamentos", ["NOVO"]],
      ["joias", ["JOIA"]],
      ["campeoes", ["CAMPEAO"]],
      ["giro", ["PARADO"]],
    ]);
  });

  it("preenche estratégia, ROAS objetivo pela menor margem e orçamento pelo CPC", () => {
    const [s] = suggestCampaigns([item({ itemId: "A", margin: 0.4 }), item({ itemId: "B", margin: 0.25, units: 10 })], ctx).suggestions;
    expect(s).toMatchObject({ kind: "campeoes", strategy: "PROFITABILITY", name: "Seller Hub · Campeões de margem" });
    expect(s.roasTarget).toBe(6.5); // 1 / (0,25 × 0,65) = 6,15 → 6,5
    expect(s.breakEvenRoas).toBe(4);
    expect(s.clicksPerDay).toBe(10);
    expect(s.reviewAt).toBe("2026-11-11T12:00:00.000Z");
    expect(s.budget).toBe(10); // 0,60 × 10 = R$ 6 → mínimo R$ 10
    expect(s.items.map((i) => i.itemId)).toEqual(["A", "B"]); // mais lucro primeiro
  });

  it("anunciado que vai bem entra como 'mover'; o que vai mal fica de fora", () => {
    const r = suggestCampaigns(
      [item({ itemId: "BOM", campaignName: "Mais vendidos", adDecision: "escalar" }), item({ itemId: "RUIM", campaignName: "X", adDecision: "reduzir" })],
      ctx,
    );
    expect(r.suggestions[0].items).toEqual([expect.objectContaining({ itemId: "BOM", action: "mover" })]);
  });

  it("conta o que ficou de fora e não sugere nada sem margem suficiente", () => {
    const r = suggestCampaigns(
      [item({ margin: null }), item({ margin: 0.03 }), item({ stock: 0 }), item({ status: "paused" }), item({ margin: null, campaignName: "X", adDecision: "manter" })],
      ctx,
    );
    expect(r.suggestions).toEqual([]);
    expect(r.skipped).toEqual({ noCost: 1, lowMargin: 1, outOfStock: 1 });
  });

  it("limita a 15 anúncios por campanha e o orçamento a R$ 150", () => {
    const many = Array.from({ length: 40 }, (_, n) => item({ itemId: `M${n}`, units: 10 + n }));
    const [s] = suggestCampaigns(many, { ...ctx, cpc: 3 }).suggestions;
    expect(s.items).toHaveLength(15);
    expect(s.items[0].itemId).toBe("M39");
    expect(s.budget).toBe(150);
  });

  it("margem estimada não vira campeão (precisa de venda real)", () => {
    expect(kinds([item({ marginEstimated: true, units: 0, stock: 5 })])).toEqual([]);
  });
});

describe("estimatedMargin", () => {
  it("desconta custo, imposto e as taxas médias", () => {
    expect(estimatedMargin(100, 40, { fee: 0.14, shipping: 0.06, tax: 0.06 })).toBeCloseTo(0.34);
    expect(estimatedMargin(100, 0, { fee: 0.14, shipping: 0, tax: 0 })).toBeNull();
  });
});
