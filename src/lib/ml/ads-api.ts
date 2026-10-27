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
    let last: unknown;
    for (const path of paths) {
      try {
        return await this.api.get<T>(path, { headers: { "api-version": "2" } });
      } catch (err) {
        last = err;
        if (!(err instanceof MlApiError) || ![400, 404, 405].includes(err.status)) throw err;
      }
    }
    throw last;
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
    return rows
      .filter((r) => r.id != null || r.campaign_id != null)
      .map((r) => ({
        id: num(r.id ?? r.campaign_id),
        name: String(r.name ?? `Campanha ${r.id ?? r.campaign_id}`),
        status: str(r.status),
        strategy: str(r.strategy),
        budget: optNum(r.budget),
        acosTarget: toFraction(r.acos_target),
        ...readMetrics(r),
      }));
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

  /** Totais por anúncio. Retorna null se a conta/API não oferece esse detalhe. */
  async items(a: Advertiser, from: Date, to: Date): Promise<AdsItemRow[] | null> {
    try {
      const rows = await this.paged((offset) => {
        const q = new URLSearchParams({ date_from: ymd(from), date_to: ymd(to), metrics: ADS_METRICS, limit: "50", offset: String(offset) });
        return [
          `/marketplace/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/ads/search?${q}`,
          `/advertising/advertisers/${a.advertiserId}/product_ads/ads?${q}`,
        ];
      });
      return rows
        .filter((r) => r.item_id != null || r.id != null)
        .map((r) => ({
          itemId: String(r.item_id ?? r.id),
          campaignId: optNum(r.campaign_id),
          status: str(r.status),
          ...readMetrics(r),
        }));
    } catch (err) {
      if (err instanceof MlApiError && [400, 403, 404, 405].includes(err.status)) return null;
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
