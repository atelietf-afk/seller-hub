import "server-only";
import { adsTotals, diagnoseAd, tacos, type AdDiagnosis, type AdsTotals } from "./analytics/ads";
import { adsData, type AdsAccountStatus, type AdsCampaignRow, type AdsItemMetricsRow } from "./data/ads";
import { ADS_PERIOD_DAYS } from "./ml/ads-sync";
import { buildReport } from "./report";

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
  campaigns: (AdsCampaignRow & { totals: AdsTotals; diagnoses: AdDiagnosis[] })[];
  items: (AdsItemMetricsRow & { totals: AdsTotals; breakEvenAcos: number | null; diagnoses: AdDiagnosis[] })[] | null;
}

/** Publicidade dos últimos 30 dias cruzada com o lucro real das vendas. */
export async function buildAdsReport(ownerId: string, accountId: string): Promise<AdsReport | null> {
  const data = await adsData(ownerId, accountId, ADS_PERIOD_DAYS);
  if (!data) return null;
  const sales = await buildReport(accountId, ownerId, ADS_PERIOD_DAYS);

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
    campaigns: data.campaigns.map((c) => ({
      ...c,
      totals: adsTotals([c]),
      diagnoses: diagnoseAd({ ...c, marginBeforeAds: storeMargin, acosTarget: c.acos_target }),
    })),
    items:
      data.status.ads_status === "ok" && data.items.length === 0 && data.campaigns.length > 0
        ? null
        : data.items.map((i) => {
            const margin = itemMargin.get(i.item_id) ?? null;
            return { ...i, totals: adsTotals([i]), breakEvenAcos: margin, diagnoses: diagnoseAd({ ...i, marginBeforeAds: margin }) };
          }),
  };
}
