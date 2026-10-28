import "server-only";
import {
  adDecision,
  adsTotals,
  breakEvenRoas,
  diagnoseCampaign,
  suggestedRoasTarget,
  tacos,
  type AdDecision,
  type AdsTotals,
  type CampaignDiagnosis,
} from "./analytics/ads";
import { estimatedMargin, suggestCampaigns, type SuggestionItem, type SuggestionResult } from "./analytics/ad-suggestions";
import { settingsOf } from "./data/accounts";
import { adsData, type AdsAccountStatus, type AdsCampaignRow, type AdsItemMetricsRow } from "./data/ads";
import { ADS_PERIOD_DAYS } from "./ml/ads-sync";
import { buildReport } from "./report";

/** Histórico usado para margem e giro nas sugestões (o backfill de pedidos chega a 120 dias). */
const SUGGESTION_HISTORY_DAYS = 120;

export interface AdsReport {
  periodDays: number;
  status: AdsAccountStatus;
  totals: AdsTotals;
  tacos: number | null;
  totalRevenue: number;       // faturamento total da loja no período (com e sem anúncio)
  profitBeforeAds: number;
  profitAfterAds: number;
  marginKnown: boolean;       // false se faltam custos de produto
  daily: { day: string; cost: number; revenue: number }[];
  /** Gasto em anúncios que a análise manda pausar (sem estoque, inativos ou sem venda). */
  wasted: number;
  campaigns: (AdsCampaignRow & {
    totals: AdsTotals;
    margin: number | null;
    breakEvenRoas: number | null;
    suggestedRoas: number | null;
    budgetUsage: number | null; // gasto médio dos últimos 7 dias ÷ orçamento diário
    diagnoses: CampaignDiagnosis[];
  })[];
  items:
    | (AdsItemMetricsRow & {
        totals: AdsTotals;
        breakEvenAcos: number | null;
        breakEvenRoas: number | null;
        decision: AdDecision;
        reason: string;
        suggestRoasTarget: number | null;
      })[]
    | null;
  /** Campanhas novas sugeridas, com os valores para preencher. */
  suggestions: SuggestionResult;
}

/** Publicidade dos últimos 30 dias cruzada com o lucro real das vendas. */
export async function buildAdsReport(ownerId: string, accountId: string): Promise<AdsReport | null> {
  const data = await adsData(ownerId, accountId, ADS_PERIOD_DAYS);
  if (!data) return null;
  const [sales, history, settings] = await Promise.all([
    buildReport(accountId, ownerId, ADS_PERIOD_DAYS),
    buildReport(accountId, ownerId, SUGGESTION_HISTORY_DAYS),
    settingsOf(ownerId),
  ]);

  const totals = adsTotals(data.campaigns);
  const marginKnown = sales.missingCosts === 0 && sales.totals.revenue > 0;
  const storeMargin = marginKnown ? sales.totals.margin : null;
  const itemMargin = new Map(
    sales.funnel.filter((f) => f.unitCost && f.revenue > 0).map((f) => [f.itemId, f.profit / f.revenue]),
  );

  const byDay = new Map(data.daily.map((d) => [String(d.day).slice(0, 10), d]));
  const daily = Array.from({ length: ADS_PERIOD_DAYS }, (_, i) => {
    const day = new Date(Date.now() - (ADS_PERIOD_DAYS - 1 - i) * 86400_000).toISOString().slice(0, 10);
    const d = byDay.get(day);
    return { day, cost: d?.cost ?? 0, revenue: d?.revenue ?? 0 };
  });

  const items = data.items.map((i) => {
    const margin = itemMargin.get(i.item_id) ?? null;
    const d = adDecision({ ...i, margin, stock: i.stock, itemStatus: i.item_status });
    return {
      ...i,
      totals: adsTotals([i]),
      breakEvenAcos: margin,
      breakEvenRoas: breakEvenRoas(margin),
      decision: d.decision,
      reason: d.reason,
      suggestRoasTarget: d.suggestRoasTarget,
    };
  });

  // Margem de cada campanha: média das margens dos produtos dela, pesada pelas vendas do anúncio.
  // Sem produto com custo na campanha, usa a margem da loja (se todos os custos estiverem cadastrados).
  const campaignMargin = (id: number) => {
    let revenue = 0;
    let profit = 0;
    for (const i of items) {
      if (i.campaign_id !== id || i.breakEvenAcos === null || i.revenue <= 0) continue;
      revenue += i.revenue;
      profit += i.revenue * i.breakEvenAcos;
    }
    return revenue > 0 ? profit / revenue : storeMargin;
  };
  const weeks = new Map(data.weeks.map((w) => [Number(w.campaign_id), w]));

  // Sugestões: margem real dos 120 dias quando houve venda; senão, estimada pelo preço, custo e taxas médias.
  const h = history.totals;
  const rates = {
    fee: h.revenue > 0 ? h.fees / h.revenue : 0.14,
    shipping: h.revenue > 0 ? h.shipping / h.revenue : 0,
    tax: settings.tax_rate,
  };
  const campaignName = new Map(data.campaigns.map((c) => [Number(c.id), c.name]));
  const adByItem = new Map(items.map((i) => [i.item_id, i]));
  const hiddenGems = new Set(sales.funnel.filter((f) => f.diagnoses.some((d) => d.code === "hidden_gem")).map((f) => f.itemId));
  const candidates: SuggestionItem[] = history.funnel.map((f) => {
    const real = f.unitCost && f.revenue > 0 ? f.profit / f.revenue : null;
    const ad = adByItem.get(f.itemId);
    return {
      itemId: f.itemId,
      title: f.title,
      thumbnail: f.thumbnail,
      price: f.price,
      status: f.status,
      stock: f.stock,
      margin: real ?? (f.unitCost ? estimatedMargin(f.price, f.unitCost, rates) : null),
      marginEstimated: real === null,
      units: f.units,
      hiddenGem: hiddenGems.has(f.itemId),
      listedAt: data.listedAt.get(f.itemId) ?? null,
      campaignName: ad ? (campaignName.get(Number(ad.campaign_id)) ?? "outra campanha") : null,
      adDecision: ad?.decision ?? null,
    };
  });
  const suggestions = suggestCampaigns(candidates, {
    now: new Date(),
    minMargin: settings.min_margin,
    cpc: totals.cpc,
    historyDays: SUGGESTION_HISTORY_DAYS,
  });

  return {
    periodDays: ADS_PERIOD_DAYS,
    status: data.status,
    totals,
    tacos: tacos(totals.cost, sales.totals.revenue),
    totalRevenue: sales.totals.revenue,
    profitBeforeAds: sales.totals.profit,
    profitAfterAds: Math.round((sales.totals.profit - totals.cost) * 100) / 100,
    marginKnown,
    daily,
    wasted: Math.round(items.filter((i) => i.decision === "pausar").reduce((a, i) => a + i.cost, 0) * 100) / 100,
    campaigns: data.campaigns.map((c) => {
      const margin = campaignMargin(Number(c.id));
      const w = weeks.get(Number(c.id));
      const week = { cost: w?.cost7 ?? 0, revenue: w?.revenue7 ?? 0 };
      return {
        ...c,
        totals: adsTotals([c]),
        margin,
        breakEvenRoas: breakEvenRoas(margin),
        suggestedRoas: suggestedRoasTarget(margin),
        budgetUsage: c.budget && c.budget > 0 && w ? week.cost / 7 / c.budget : null,
        diagnoses: diagnoseCampaign({
          ...c,
          roasTarget: c.roas_target,
          margin,
          impressionShare: c.impression_share,
          lostByBudget: c.lost_by_budget,
          lostByRank: c.lost_by_rank,
          acosBenchmark: c.acos_benchmark,
          week,
          prevWeek: { cost: w?.cost_prev7 ?? 0, revenue: w?.revenue_prev7 ?? 0 },
        }),
      };
    }),
    items: data.status.ads_status === "ok" && data.items.length === 0 && data.campaigns.length > 0 ? null : items,
    suggestions,
  };
}
