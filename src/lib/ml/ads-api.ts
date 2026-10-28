import { MlApi, MlApiError } from "./api";

// Product Ads (publicidade) do Mercado Livre.
// A API mudou de endereço ao longo do tempo e o formato das respostas varia entre
// versões, então tudo aqui é defensivo: tenta o caminho novo, cai no antigo, e lê
// as métricas tanto de "metrics" quanto do próprio objeto.

export const ADS_METRICS = [
  "clicks",
  "prints",
  "cost",
  "cpc",
  "ctr",
  "acos",
  "roas",
  "direct_amount",
  "indirect_amount",
  "total_amount",
  "direct_units_quantity",
  "indirect_units_quantity",
  "units_quantity",
].join(",");

/** Métricas de leilão da campanha. Pedidas à parte: se a API recusar, seguimos sem elas. */
export const ADS_INSIGHT_METRICS = [
  "impression_share",
  "top_impression_share",
  "lost_impression_share_by_budget",
  "lost_impression_share_by_ad_rank",
  "acos_benchmark",
].join(",");

export interface AdsMetrics {
  clicks: number;
  prints: number;
  cost: number;
  revenue: number;
  units: number;
}

export interface Advertiser {
  advertiserId: number;
  siteId: string;
}

export interface AdsCampaign extends AdsMetrics {
  id: number;
  name: string;
  status: string | null;
  strategy: string | null;
  budget: number | null;
  acosTarget: number | null; // fração
  /** ROAS objetivo (1x–35x). Substituiu o ACOS alvo em 2026; quando só vem o ACOS, é 1 ÷ ACOS. */
  roasTarget: number | null;
  impressionShare: number | null; // frações
  topImpressionShare: number | null;
  lostByBudget: number | null;
  lostByRank: number | null;
  acosBenchmark: number | null;
}

export interface AdsDailyRow extends AdsMetrics {
  campaignId: number;
  day: string;
}

export interface AdsItemRow extends AdsMetrics {
  itemId: string;
  campaignId: number | null;
  status: string | null;
}

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) || 0 : 0);
const optNum = (v: unknown) => (v == null || v === "" ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

/** Lê as métricas de um elemento da resposta, venham elas em `metrics` ou no próprio objeto. */
export function readMetrics(el: Obj): AdsMetrics {
  const m = (el.metrics && typeof el.metrics === "object" && !Array.isArray(el.metrics) ? el.metrics : el) as Obj;
  const revenue = m.total_amount != null ? num(m.total_amount) : num(m.direct_amount) + num(m.indirect_amount);
  const units =
    m.units_quantity != null ? num(m.units_quantity) : num(m.direct_units_quantity) + num(m.indirect_units_quantity);
  return { clicks: num(m.clicks), prints: num(m.prints), cost: num(m.cost), revenue, units };
}

/** ACOS alvo pode vir como 15 (porcentagem) ou 0.15 (fração). */
export function toFraction(v: unknown): number | null {
  const n = optNum(v);
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  return n > 1 ? n / 100 : n;
}

/** Percentual que pode vir como 35 ou 0.35. Diferente de toFraction, aceita 0. */
export function share(v: unknown): number | null {
  const n = optNum(v);
  if (n === null || !Number.isFinite(n) || n < 0) return null;
  return n > 1 ? n / 100 : n;
}

const metricOf = (el: Obj, key: string) => {
  const m = el.metrics && typeof el.metrics === "object" && !Array.isArray(el.metrics) ? (el.metrics as Obj) : null;
  return m?.[key] ?? el[key];
};

/** Campanha da API no nosso formato. */
export function parseCampaign(r: Obj): AdsCampaign {
  const acosTarget = toFraction(r.acos_target);
  const roas = optNum(r.roas_target);
  return {
    id: num(r.id ?? r.campaign_id),
    name: String(r.name ?? `Campanha ${r.id ?? r.campaign_id}`),
    status: str(r.status),
    strategy: str(r.strategy),
    budget: optNum(r.budget ?? r.daily_budget),
    acosTarget,
    roasTarget: roas !== null && Number.isFinite(roas) && roas > 0 ? roas : acosTarget ? Math.round((1 / acosTarget) * 100) / 100 : null,
    impressionShare: share(metricOf(r, "impression_share")),
    topImpressionShare: share(metricOf(r, "top_impression_share")),
    lostByBudget: share(metricOf(r, "lost_impression_share_by_budget")),
    lostByRank: share(metricOf(r, "lost_impression_share_by_ad_rank")),
    acosBenchmark: toFraction(metricOf(r, "acos_benchmark")),
    ...readMetrics(r),
  };
}

function results(body: unknown): Obj[] {
  if (Array.isArray(body)) return body as Obj[];
  const b = body as Obj;
  for (const k of ["results", "campaigns", "ads", "data"]) if (Array.isArray(b?.[k])) return b[k] as Obj[];
  return [];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export class MlAdsApi {
  constructor(private api: MlApi) {}

  /** Conta de anunciante de Product Ads. null quando o vendedor não usa Product Ads. */
  async advertiser(): Promise<Advertiser | null> {
    const body = await this.api.get<unknown>("/advertising/advertisers?product_id=PADS", { headers: { "Api-Version": "1" } });
    const list = Array.isArray((body as Obj)?.advertisers) ? ((body as Obj).advertisers as Obj[]) : results(body);
    const first = list.find((a) => a.advertiser_id != null);
    return first ? { advertiserId: num(first.advertiser_id), siteId: String(first.site_id ?? "MLB") } : null;
  }

  /** Tenta cada caminho em ordem; 404/400 de caminho desconhecido passa para o próximo. */
  private async firstWorking<T>(paths: string[]): Promise<T> {
    let first: MlApiError | undefined;
    for (const path of paths) {
      try {
        return await this.api.get<T>(path, { headers: { "api-version": "2" } });
      } catch (err) {
        if (!(err instanceof MlApiError) || ![400, 404, 405].includes(err.status)) throw err;
        // Guarda o erro mais útil: um 400 do caminho atual diz mais que o 404 do caminho antigo.
        if (!first || (first.status === 404 && err.status !== 404)) first = err;
      }
    }
    throw first;
  }

  private async paged(paths: (offset: number) => string[]): Promise<Obj[]> {
    const out: Obj[] = [];
    for (let offset = 0; offset < 10_000; offset += 50) {
      const page = results(await this.firstWorking<unknown>(paths(offset)));
      out.push(...page);
      if (page.length < 50) break;
    }
    return out;
  }

  private campaignPaths(a: Advertiser, q: URLSearchParams) {
    return [
      `/marketplace/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/campaigns/search?${q}`,
      `/advertising/advertisers/${a.advertiserId}/product_ads/campaigns?${q}`,
    ];
  }

  async campaigns(a: Advertiser, from: Date, to: Date): Promise<AdsCampaign[]> {
    const rows = await this.paged((offset) =>
      this.campaignPaths(
        a,
        new URLSearchParams({ date_from: ymd(from), date_to: ymd(to), metrics: ADS_METRICS, limit: "50", offset: String(offset) }),
      ),
    );
    const campaigns = rows.filter((r) => r.id != null || r.campaign_id != null).map(parseCampaign);
    await this.addInsights(a, campaigns, from, to);
    return campaigns;
  }

  /**
   * Métricas de leilão e ROAS objetivo vêm do detalhe de cada campanha (a busca de
   * campanhas recusa impression_share). Sem elas a publicidade funciona igual, então
   * na primeira recusa paramos de tentar e só registramos o motivo.
   */
  private async addInsights(a: Advertiser, campaigns: AdsCampaign[], from: Date, to: Date) {
    const q = new URLSearchParams({ date_from: ymd(from), date_to: ymd(to), metrics: ADS_INSIGHT_METRICS });
    for (const c of campaigns) {
      let detail: Obj;
      try {
        detail = await this.firstWorking<Obj>([
          `/marketplace/advertising/${a.siteId}/product_ads/campaigns/${c.id}?${q}`,
          `/advertising/${a.siteId}/product_ads/campaigns/${c.id}?${q}`,
        ]);
      } catch (err) {
        if (!(err instanceof MlApiError) || ![400, 403, 404, 405].includes(err.status)) throw err;
        console.warn("Métricas de leilão indisponíveis na API de publicidade", err.message);
        return;
      }
      const body = results(detail)[0] ?? detail; // pode vir solto ou dentro de "results"
      const d = parseCampaign({ id: c.id, ...body });
      c.roasTarget ??= d.roasTarget;
      c.acosTarget ??= d.acosTarget;
      c.budget ??= d.budget;
      c.strategy ??= d.strategy;
      c.impressionShare = d.impressionShare;
      c.topImpressionShare = d.topImpressionShare;
      c.lostByBudget = d.lostByBudget;
      c.lostByRank = d.lostByRank;
      c.acosBenchmark = d.acosBenchmark;
    }
  }

  /** Métricas diárias por campanha. Aceita linhas com data no topo ou listas de dias dentro da campanha. */
  async campaignsDaily(a: Advertiser, from: Date, to: Date): Promise<AdsDailyRow[]> {
    const rows = await this.paged((offset) =>
      this.campaignPaths(
        a,
        new URLSearchParams({
          date_from: ymd(from),
          date_to: ymd(to),
          metrics: ADS_METRICS,
          aggregation_type: "DAILY",
          limit: "50",
          offset: String(offset),
        }),
      ),
    );
    return parseDaily(rows);
  }

  /** De onde vieram as métricas por anúncio na última chamada a items() (para diagnóstico). */
  itemsSource: "ads" | "ad_groups" | null = null;

  /** Grupos de anúncios (o ML organiza os anúncios de cada campanha em grupos). */
  async adGroups(a: Advertiser): Promise<{ id: number; campaignId: number | null }[]> {
    const rows = await this.paged((offset) => {
      const q = new URLSearchParams({ limit: "50", offset: String(offset) });
      return [
        `/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/ad_groups/search?${q}`,
        `/marketplace/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/ad_groups/search?${q}`,
      ];
    });
    return rows
      .filter((r) => r.id != null || r.ad_group_id != null)
      .map((r) => ({ id: num(r.id ?? r.ad_group_id), campaignId: optNum(r.campaign_id) }));
  }

  /** Métricas por anúncio pelos grupos: o caminho que substitui /product_ads/ads/search (desativado em 2026). */
  async itemsViaAdGroups(a: Advertiser, from: Date, to: Date): Promise<AdsItemRow[]> {
    const out: AdsItemRow[] = [];
    const groups = await this.adGroups(a);
    // Pode haver centenas de grupos (um por anúncio): busca 5 de cada vez.
    let next = 0;
    const worker = async () => {
      while (next < groups.length) {
        const g = groups[next++];
        await loadGroup(g);
      }
    };
    const loadGroup = async (g: { id: number; campaignId: number | null }) => {
      const rows = await this.paged((offset) => {
        const q = new URLSearchParams({ date_from: ymd(from), date_to: ymd(to), metrics: ADS_METRICS, limit: "50", offset: String(offset) });
        return [
          `/advertising/${a.siteId}/product_ads/ad_groups/${g.id}/ads?${q}`,
          `/marketplace/advertising/${a.siteId}/product_ads/ad_groups/${g.id}/ads?${q}`,
        ];
      });
      for (const r of rows) {
        if (r.item_id == null && r.id == null) continue;
        out.push({ itemId: String(r.item_id ?? r.id), campaignId: optNum(r.campaign_id) ?? g.campaignId, status: str(r.status), ...readMetrics(r) });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, groups.length) }, worker));
    return out;
  }

  /** Totais por anúncio. Retorna null se a conta/API não oferece esse detalhe. */
  async items(a: Advertiser, from: Date, to: Date): Promise<AdsItemRow[] | null> {
    const unavailable = (err: unknown) => err instanceof MlApiError && [400, 403, 404, 405, 410].includes(err.status);
    try {
      const rows = await this.paged((offset) => {
        const q = new URLSearchParams({ date_from: ymd(from), date_to: ymd(to), metrics: ADS_METRICS, limit: "50", offset: String(offset) });
        return [
          `/marketplace/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/ads/search?${q}`,
          `/advertising/advertisers/${a.advertiserId}/product_ads/ads?${q}`,
        ];
      });
      this.itemsSource = "ads";
      return rows
        .filter((r) => r.item_id != null || r.id != null)
        .map((r) => ({
          itemId: String(r.item_id ?? r.id),
          campaignId: optNum(r.campaign_id),
          status: str(r.status),
          ...readMetrics(r),
        }));
    } catch (err) {
      if (!unavailable(err)) throw err;
    }
    try {
      const rows = await this.itemsViaAdGroups(a, from, to);
      this.itemsSource = "ad_groups";
      return rows;
    } catch (err) {
      if (unavailable(err)) return null;
      throw err;
    }
  }
}

export function parseDaily(rows: Obj[]): AdsDailyRow[] {
  const out: AdsDailyRow[] = [];
  for (const r of rows) {
    const campaignId = num(r.campaign_id ?? r.id);
    const date = r.date ?? r.day;
    if (date) {
      out.push({ campaignId, day: String(date).slice(0, 10), ...readMetrics(r) });
      continue;
    }
    const nested = Array.isArray(r.metrics) ? r.metrics : Array.isArray(r.results) ? r.results : null;
    for (const d of (nested ?? []) as Obj[]) {
      const day = d.date ?? d.day;
      if (day) out.push({ campaignId, day: String(day).slice(0, 10), ...readMetrics(d) });
    }
  }
  return out;
}
