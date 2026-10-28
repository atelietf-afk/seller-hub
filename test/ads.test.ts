import { describe, expect, it } from "vitest";
import {
  adDecision,
  adsTotals,
  breakEvenRoas,
  diagnoseCampaign,
  suggestedRoasTarget,
  tacos,
  type CampaignInput,
} from "@/lib/analytics/ads";
import { MlApi } from "@/lib/ml/api";
import { MlAdsApi, parseDaily, readMetrics, toFraction } from "@/lib/ml/ads-api";

const m = (over = {}) => ({ clicks: 100, prints: 10_000, cost: 50, revenue: 500, units: 5, ...over });

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


describe("ROAS de equilíbrio e sugerido", () => {
  it("equilíbrio é 1 ÷ margem", () => {
    expect(breakEvenRoas(0.25)).toBe(4);
    expect(breakEvenRoas(0)).toBeNull();
    expect(breakEvenRoas(null)).toBeNull();
  });

  it("sugerido deixa lucro, arredonda para cima em 0,5 e respeita 1x–35x", () => {
    expect(suggestedRoasTarget(0.28)).toBe(5.5); // 1 / (0,28 × 0,65) = 5,49
    expect(suggestedRoasTarget(0.5)).toBe(3.5); // 3,08 → 3,5
    expect(suggestedRoasTarget(0.01)).toBe(35);
    expect(suggestedRoasTarget(2)).toBe(1);
    expect(suggestedRoasTarget(-0.1)).toBeNull();
  });
});

const camp = (o: Partial<CampaignInput> = {}): CampaignInput => ({
  ...m({ cost: 100, revenue: 1000 }),
  status: "active",
  budget: 20,
  roasTarget: 6,
  margin: 0.3,
  impressionShare: null,
  lostByBudget: null,
  lostByRank: null,
  acosBenchmark: null,
  week: { cost: 70, revenue: 700 },
  prevWeek: { cost: 70, revenue: 700 },
  ...o,
});
const ccodes = (c: CampaignInput) => diagnoseCampaign(c).map((d) => d.code);

describe("diagnoseCampaign", () => {
  it("ROAS objetivo abaixo do equilíbrio é crítico e sugere o valor", () => {
    const d = diagnoseCampaign(camp({ roasTarget: 2.5 })); // equilíbrio 3,33x
    expect(d[0]).toMatchObject({ code: "target_below_break_even", severity: "critical", suggest: { roasTarget: 5.5 } });
  });

  it("ROAS real abaixo do equilíbrio é prejuízo", () => {
    expect(ccodes(camp({ cost: 400, revenue: 1000 }))).toContain("losing_money");
  });

  it("lucrativa e perdendo exibição por orçamento: sugere mais orçamento", () => {
    const d = diagnoseCampaign(camp({ impressionShare: 0.5, lostByBudget: 0.3 }));
    expect(d[0]).toMatchObject({ code: "budget_limited", severity: "success", suggest: { budget: 30 } }); // 20 × 1,6 = 32 → 30
  });

  it("lucrativa e gastando todo o orçamento, mesmo sem a métrica de perda", () => {
    expect(diagnoseCampaign(camp({ week: { cost: 140, revenue: 1400 } }))[0]).toMatchObject({ code: "budget_limited", suggest: { budget: 25 } });
  });

  it("não sugere mais orçamento para campanha que não dá lucro ou está pausada", () => {
    expect(ccodes(camp({ cost: 300, revenue: 1000, lostByBudget: 0.4 }))).not.toContain("budget_limited");
    expect(ccodes(camp({ status: "paused", lostByBudget: 0.4 }))).not.toContain("budget_limited");
  });

  it("perde por classificação com ROAS objetivo exigente demais: sugere baixar até o que ainda dá lucro", () => {
    const d = diagnoseCampaign(camp({ roasTarget: 10, lostByRank: 0.5 }));
    expect(d.find((x) => x.code === "rank_limited")).toMatchObject({ suggest: { roasTarget: 5.5 } });
    // Já no sugerido: propõe um teste mais agressivo que ainda dá lucro (1 / (0,3 × 0,85) = 3,9 → 4x)
    const atSuggested = diagnoseCampaign(camp({ roasTarget: 5.5, lostByRank: 0.5 })).find((x) => x.code === "rank_limited")!;
    expect(atSuggested.suggest).toEqual({ roasTarget: 4 });
    expect(atSuggested.message).toContain("teste 4x por 14 dias");
    // Já agressivo ou sem margem: só melhorar os anúncios
    expect(diagnoseCampaign(camp({ roasTarget: 3.5, lostByRank: 0.5 })).find((x) => x.code === "rank_limited")?.suggest).toBeUndefined();
    expect(diagnoseCampaign(camp({ margin: null, lostByRank: 0.5 })).find((x) => x.code === "rank_limited")?.suggest).toBeUndefined();
  });

  it("gasto sem venda: crítico se ativa, aviso se já pausada", () => {
    expect(diagnoseCampaign(camp({ revenue: 0, units: 0, cost: 96 }))[0]).toMatchObject({ code: "spend_no_sales", severity: "critical" });
    expect(diagnoseCampaign(camp({ status: "paused", revenue: 0, units: 0, cost: 96 }))[0]).toMatchObject({ severity: "warning" });
  });

  it("ACOS acima da referência e piora na semana", () => {
    expect(ccodes(camp({ acosBenchmark: 0.05 }))).toContain("above_benchmark");
    expect(ccodes(camp({ week: { cost: 100, revenue: 500 }, prevWeek: { cost: 50, revenue: 500 } }))).toContain("getting_worse");
  });

  it("sem margem não julga lucro, mas usa o ROAS objetivo para saber se vale escalar", () => {
    expect(ccodes(camp({ margin: null, lostByBudget: 0.3 }))).toEqual(["budget_limited"]);
    expect(ccodes(camp({ margin: null }))).toEqual(["ok"]);
  });
});

describe("adDecision", () => {
  const ad = (o = {}) => ({ ...m({ cost: 50, revenue: 500 }), margin: 0.3, stock: 10, itemStatus: "active", ...o });
  it("pausa sem estoque, inativo ou gastando sem vender", () => {
    expect(adDecision(ad({ stock: 0 })).decision).toBe("pausar");
    expect(adDecision(ad({ itemStatus: "paused" })).decision).toBe("pausar");
    expect(adDecision(ad({ revenue: 0, units: 0, clicks: 30 })).decision).toBe("pausar");
  });
  it("reduz quando dá prejuízo e sugere o ROAS objetivo", () => {
    expect(adDecision(ad({ cost: 200, revenue: 500 }))).toMatchObject({ decision: "reduzir", suggestRoasTarget: 5.5 });
  });
  it("escala quando o ROAS é o dobro do equilíbrio", () => {
    expect(adDecision(ad({ cost: 50, revenue: 1000 })).decision).toBe("escalar");
  });
  it("pede o custo e mantém o resto", () => {
    expect(adDecision(ad({ margin: null })).decision).toBe("cadastrar_custo");
    expect(adDecision(ad({ cost: 100, revenue: 500 })).decision).toBe("manter");
    expect(adDecision(ad({ clicks: 10, prints: 20_000 })).decision).toBe("revisar");
  });
});


describe("escrita em campanhas", () => {
  const adv = { advertiserId: 9, siteId: "MLB" };
  const recorder = (responses: Response[]) => {
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return responses.shift()!;
    }) as unknown as typeof fetch;
    return { calls, ads: new MlAdsApi(new MlApi(async () => "tok", fetchFn)) };
  };

  it("altera a campanha com PUT, api-version 2 e só o campo mudado", async () => {
    const { calls, ads } = recorder([new Response("{}", { status: 200 })]);
    await ads.updateCampaign(adv, 5, { roas_target: 4.5 });
    expect(calls).toEqual([
      {
        url: "https://api.mercadolibre.com/marketplace/advertising/MLB/product_ads/campaigns/5",
        method: "PUT",
        headers: expect.objectContaining({ "api-version": "2", Authorization: "Bearer tok" }),
        body: { roas_target: 4.5 },
      },
    ]);
  });

  it("cai no caminho sem /marketplace só se o primeiro não existir", async () => {
    const { calls, ads } = recorder([new Response("not found", { status: 404 }), new Response("", { status: 200 })]);
    await ads.updateCampaign(adv, 5, { status: "paused" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.mercadolibre.com/marketplace/advertising/MLB/product_ads/campaigns/5",
      "https://api.mercadolibre.com/advertising/MLB/product_ads/campaigns/5",
    ]);
    const denied = recorder([new Response("forbidden", { status: 403 })]);
    await expect(denied.ads.updateCampaign(adv, 5, { budget: 10 })).rejects.toMatchObject({ status: 403 });
    expect(denied.calls).toHaveLength(1); // permissão negada não tenta outro caminho
  });

  it("cria a campanha com POST no anunciante e devolve o id", async () => {
    const { calls, ads } = recorder([new Response(JSON.stringify({ id: 321 }), { status: 201 })]);
    const id = await ads.createCampaign(adv, { name: "Seller Hub · Lançamentos", status: "active", budget: 10, strategy: "visibility", roas_target: 2.5 });
    expect(id).toBe(321);
    expect(calls[0].url).toBe("https://api.mercadolibre.com/marketplace/advertising/MLB/advertisers/9/product_ads/campaigns");
    expect(calls[0].body).toEqual({ channel: "marketplace", name: "Seller Hub · Lançamentos", status: "active", budget: 10, strategy: "visibility", roas_target: 2.5 });
  });
});
