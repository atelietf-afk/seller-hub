import { breakEvenRoas, ROAS_MAX, ROAS_MIN, type AdDecision } from "./ads";

// Campanhas novas sugeridas, já com os valores para preencher no Mercado Ads.
//
// ROAS objetivo = 1 ÷ (margem × fatia da margem que pode ir para o anúncio). A margem
// usada é a menor do grupo, para nenhum produto da campanha vender com prejuízo.
// Orçamento = CPC médio da conta × cliques por dia que a estratégia pede.

export type SuggestionKind = "lancamentos" | "joias" | "campeoes" | "giro";
export type Strategy = "PROFITABILITY" | "INCREASE" | "VISIBILITY";

export interface SuggestionItem {
  itemId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  status: string;
  stock: number;
  /** Margem antes dos anúncios. null sem custo cadastrado. */
  margin: number | null;
  /** true quando não houve venda no histórico e a margem é estimada pelo preço e custo. */
  marginEstimated: boolean;
  /** Unidades vendidas nos últimos 120 dias. */
  units: number;
  /** Converte bem e recebe pouca visita (diagnóstico do funil). */
  hiddenGem: boolean;
  listedAt: string | null;
  /** Campanha em que o anúncio já está, se estiver. */
  campaignName: string | null;
  adDecision: AdDecision | null;
}

export interface SuggestionContext {
  now: Date;
  minMargin: number;
  /** CPC médio da conta nos anúncios atuais. */
  cpc: number | null;
  historyDays: number;
}

interface KindConfig {
  name: string;
  strategy: Strategy;
  /** Fatia da margem que pode ir para o anúncio. */
  share: number;
  clicksPerItem: number;
  why: string;
  reviewDays: number;
}

export const KINDS: Record<SuggestionKind, KindConfig> = {
  lancamentos: {
    name: "Lançamentos",
    strategy: "VISIBILITY",
    share: 0.95,
    clicksPerItem: 10,
    why: "Anúncios novos precisam de visitas e das primeiras vendas para ganhar posição na busca. O ROAS objetivo fica perto do equilíbrio: lucro pequeno agora em troca de histórico.",
    reviewDays: 14,
  },
  joias: {
    name: "Joias escondidas",
    strategy: "INCREASE",
    share: 0.8,
    clicksPerItem: 8,
    why: "Convertem acima da média da loja, mas recebem pouca visita. O anúncio leva tráfego para quem já sabe vender.",
    reviewDays: 14,
  },
  campeoes: {
    name: "Campeões de margem",
    strategy: "PROFITABILITY",
    share: 0.65,
    clicksPerItem: 5,
    why: "Os produtos que mais dão lucro e já vendem bem, numa campanha só deles, com verba protegida. Os que já estão em outra campanha devem ser movidos para cá.",
    reviewDays: 14,
  },
  giro: {
    name: "Giro de estoque",
    strategy: "INCREASE",
    share: 0.9,
    clicksPerItem: 6,
    why: "Estoque parado para muitos meses no ritmo atual. Anunciar com ROAS perto do equilíbrio transforma estoque em caixa sem dar prejuízo.",
    reviewDays: 21,
  },
};

export const STRATEGY_LABEL: Record<Strategy, string> = {
  PROFITABILITY: "Rentabilidade",
  INCREASE: "Crescimento",
  VISIBILITY: "Visibilidade",
};

export interface CampaignSuggestion {
  kind: SuggestionKind;
  name: string;
  strategy: Strategy;
  roasTarget: number;
  /** ROAS de equilíbrio do produto de menor margem do grupo. */
  breakEvenRoas: number;
  budget: number;
  clicksPerDay: number;
  why: string;
  reviewDays: number;
  /** Data (ISO) para revisar o resultado. */
  reviewAt: string;
  items: (SuggestionItem & { action: "novo" | "mover" })[];
}

export interface SuggestionResult {
  suggestions: CampaignSuggestion[];
  /** Anúncios ativos e fora de campanha que ficaram de fora, por motivo. */
  skipped: { noCost: number; lowMargin: number; outOfStock: number };
}

const DAY = 86_400_000;
const MAX_ITEMS = 15;
const LAUNCH_DAYS = 30;
const SLOW_STOCK_DAYS = 90;
const DEFAULT_CPC = 0.5;

const roundBudget = (n: number) => Math.round(n / 5) * 5;

function roasFor(margin: number, share: number) {
  return Math.min(ROAS_MAX, Math.max(ROAS_MIN, Math.ceil((1 / (margin * share)) * 2) / 2));
}

export function suggestCampaigns(items: SuggestionItem[], ctx: SuggestionContext): SuggestionResult {
  const skipped = { noCost: 0, lowMargin: 0, outOfStock: 0 };
  const groups: Record<SuggestionKind, SuggestionItem[]> = { lancamentos: [], joias: [], campeoes: [], giro: [] };
  const floor = Math.max(ctx.minMargin, 0.05);

  for (const i of items) {
    if (i.status !== "active") continue;
    const advertised = i.campaignName !== null;
    // Anunciado só entra se a análise atual manda manter ou escalar (vira "mover" para a campanha certa).
    if (advertised && i.adDecision !== "escalar" && i.adDecision !== "manter") continue;
    if (i.stock <= 0) {
      if (!advertised) skipped.outOfStock++;
      continue;
    }
    if (i.margin === null) {
      if (!advertised) skipped.noCost++;
      continue;
    }
    if (i.margin < floor) {
      if (!advertised) skipped.lowMargin++;
      continue;
    }

    const isLaunch = !advertised && i.listedAt !== null && ctx.now.getTime() - new Date(i.listedAt).getTime() <= LAUNCH_DAYS * DAY;
    const perDay = i.units / Math.max(ctx.historyDays, 1);
    const stockDays = perDay > 0 ? i.stock / perDay : Infinity;
    if (isLaunch) groups.lancamentos.push(i);
    else if (!advertised && i.hiddenGem) groups.joias.push(i);
    else if (!i.marginEstimated && i.units >= 3 && i.margin >= Math.max(ctx.minMargin, 0.15)) groups.campeoes.push(i);
    else if (!advertised && i.stock >= 10 && stockDays > SLOW_STOCK_DAYS) groups.giro.push(i);
  }

  const profit = (i: SuggestionItem) => (i.margin ?? 0) * i.price * Math.max(i.units, 1);
  const suggestions: CampaignSuggestion[] = [];
  for (const kind of Object.keys(groups) as SuggestionKind[]) {
    const list = groups[kind].sort((a, b) => profit(b) - profit(a)).slice(0, MAX_ITEMS);
    if (!list.length) continue;
    const cfg = KINDS[kind];
    const lowest = Math.min(...list.map((i) => i.margin!));
    const clicksPerDay = cfg.clicksPerItem * list.length;
    const budget = Math.min(150, Math.max(10, roundBudget((ctx.cpc ?? DEFAULT_CPC) * clicksPerDay)));
    suggestions.push({
      kind,
      name: `Seller Hub · ${cfg.name}`,
      strategy: cfg.strategy,
      roasTarget: roasFor(lowest, cfg.share),
      breakEvenRoas: Math.round(breakEvenRoas(lowest)! * 10) / 10,
      budget,
      clicksPerDay,
      why: cfg.why,
      reviewDays: cfg.reviewDays,
      reviewAt: new Date(ctx.now.getTime() + cfg.reviewDays * DAY).toISOString(),
      items: list.map((i) => ({ ...i, action: i.campaignName ? "mover" : "novo" })),
    });
  }
  return { suggestions, skipped };
}

/** Margem estimada de um produto sem venda: preço menos custo, imposto e as taxas médias da loja. */
export function estimatedMargin(price: number, unitCost: number, rates: { fee: number; shipping: number; tax: number }): number | null {
  if (price <= 0 || unitCost <= 0) return null;
  return 1 - rates.fee - rates.shipping - rates.tax - unitCost / price;
}
