// Publicidade: indicadores e diagnóstico por campanha e por anúncio.
//
// ACOS = investimento / vendas atribuídas aos anúncios.
// ACOS de equilíbrio = margem antes dos anúncios: acima dele, cada venda feita
// pelo anúncio dá prejuízo.

export interface AdsMetricsInput {
  clicks: number;
  prints: number;
  cost: number;
  revenue: number;
  units: number;
}

export interface AdsTotals extends AdsMetricsInput {
  acos: number | null; // fração
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
  conversion: number | null; // unidades / cliques
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function adsTotals(rows: AdsMetricsInput[]): AdsTotals {
  const t = rows.reduce(
    (a, r) => ({
      clicks: a.clicks + r.clicks,
      prints: a.prints + r.prints,
      cost: a.cost + r.cost,
      revenue: a.revenue + r.revenue,
      units: a.units + r.units,
    }),
    { clicks: 0, prints: 0, cost: 0, revenue: 0, units: 0 },
  );
  return {
    ...t,
    cost: round2(t.cost),
    revenue: round2(t.revenue),
    acos: ratio(t.cost, t.revenue),
    roas: ratio(t.revenue, t.cost),
    ctr: ratio(t.clicks, t.prints),
    cpc: ratio(t.cost, t.clicks),
    conversion: ratio(t.units, t.clicks),
  };
}

/** Quanto do faturamento total vai para anúncios (TACOS). */
export function tacos(adCost: number, totalRevenue: number): number | null {
  return ratio(adCost, totalRevenue);
}

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// ---------------------------------------------------------------------------
// ROAS objetivo e diagnóstico de campanha.
//
// Desde 2026 o Mercado Livre configura as campanhas por ROAS objetivo (1x a 35x).
// ROAS de equilíbrio = 1 ÷ margem antes dos anúncios: abaixo dele a venda pelo
// anúncio dá prejuízo. O sugerido mira um ACOS de 65% da margem, deixando lucro.

export const ROAS_MIN = 1;
export const ROAS_MAX = 35;
/** Fração da margem que pode ir para o anúncio no ROAS sugerido (regra de mercado: 60–70%). */
export const SAFE_MARGIN_SHARE = 0.65;
/** Fatia da margem num teste para ganhar exibição (ainda acima do equilíbrio). */
export const AGGRESSIVE_MARGIN_SHARE = 0.85;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const x = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;

export function breakEvenRoas(margin: number | null): number | null {
  return margin !== null && margin > 0 ? 1 / margin : null;
}

/** ROAS objetivo que deixa lucro: arredondado para cima em 0,5 e dentro de 1x–35x. null sem margem positiva. */
export function suggestedRoasTarget(margin: number | null, share = SAFE_MARGIN_SHARE): number | null {
  if (margin === null || margin <= 0) return null;
  const raw = 1 / (margin * share);
  return Math.min(ROAS_MAX, Math.max(ROAS_MIN, Math.ceil(raw * 2) / 2));
}

/** Orçamento arredondado para múltiplos de R$ 5 (mínimo R$ 5). */
const roundBudget = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export interface CampaignInput extends AdsMetricsInput {
  status: string | null;
  budget: number | null; // por dia
  roasTarget: number | null;
  /** Margem antes dos anúncios dos produtos da campanha. null sem custo cadastrado. */
  margin: number | null;
  impressionShare: number | null;
  lostByBudget: number | null;
  lostByRank: number | null;
  acosBenchmark: number | null;
  /** Últimos 7 dias e os 7 anteriores, para tendência e uso do orçamento. */
  week: { cost: number; revenue: number };
  prevWeek: { cost: number; revenue: number };
}

export type CampaignCode =
  | "target_below_break_even"
  | "losing_money"
  | "budget_limited"
  | "rank_limited"
  | "above_benchmark"
  | "getting_worse"
  | "spend_no_sales"
  | "ok";

export interface CampaignDiagnosis {
  code: CampaignCode;
  severity: "info" | "success" | "warning" | "critical";
  message: string;
  /** Valores sugeridos para aplicar no Mercado Livre. */
  suggest?: { budget?: number; roasTarget?: number };
}

export function diagnoseCampaign(c: CampaignInput): CampaignDiagnosis[] {
  const t = adsTotals([c]);
  const out: CampaignDiagnosis[] = [];
  const be = breakEvenRoas(c.margin);
  const sug = suggestedRoasTarget(c.margin);
  const usage = c.budget && c.budget > 0 ? c.week.cost / 7 / c.budget : null;
  const profitable = t.roas !== null && (be !== null ? t.roas >= be * 1.2 : c.roasTarget !== null && t.roas >= c.roasTarget);

  if (c.revenue === 0 && c.cost >= 30) {
    out.push(
      c.status === "active"
        ? { code: "spend_no_sales", severity: "critical", message: `Gastou ${brl(c.cost)} sem nenhuma venda atribuída. Revise os anúncios da campanha ou pause.` }
        : { code: "spend_no_sales", severity: "warning", message: `Gastou ${brl(c.cost)} sem nenhuma venda antes de ser pausada. Só reative depois de revisar os anúncios.` },
    );
  }
  if (c.roasTarget !== null && be !== null && c.roasTarget < be) {
    out.push({
      code: "target_below_break_even",
      severity: "critical",
      message: `ROAS objetivo de ${x(c.roasTarget)} está abaixo do equilíbrio de ${x(be)} (margem ${pct(c.margin!)}): o Mercado Livre pode vender com prejuízo. Use ${x(sug!)}.`,
      suggest: { roasTarget: sug! },
    });
  }
  if (t.roas !== null && be !== null && t.roas < be && c.cost > 0) {
    out.push({
      code: "losing_money",
      severity: "critical",
      message: `ROAS real de ${x(t.roas)} ficou abaixo do equilíbrio de ${x(be)}: as vendas pelo anúncio deram prejuízo.${sug ? ` Suba o ROAS objetivo para ${x(sug)}.` : ""}`,
      suggest: sug ? { roasTarget: sug } : undefined,
    });
  }
  if (c.status === "active" && profitable && c.budget) {
    const lost = c.lostByBudget ?? 0;
    if (lost >= 0.15 || (usage !== null && usage >= 0.9)) {
      const share = c.impressionShare && c.impressionShare > 0 ? c.impressionShare : null;
      const factor = share ? Math.min(2, (share + lost) / share) : 1.3;
      const budget = roundBudget(c.budget * Math.max(factor, 1.2));
      out.push({
        code: "budget_limited",
        severity: "success",
        message:
          lost >= 0.15
            ? `Dá lucro e perde ${pct(lost)} das exibições por falta de orçamento. Aumente de ${brl(c.budget)} para ${brl(budget)} por dia.`
            : `Dá lucro e já usa ${pct(Math.min(usage!, 1))} do orçamento. Aumente de ${brl(c.budget)} para ${brl(budget)} por dia para vender mais.`,
        suggest: { budget },
      });
    }
  }
  if (c.status === "active" && (c.lostByRank ?? 0) >= 0.3) {
    const lost = pct(c.lostByRank!);
    const tooStrict = c.roasTarget !== null && sug !== null && c.roasTarget > sug * 1.15;
    // Teste mais agressivo: até 85% da margem no anúncio, ainda acima do equilíbrio.
    const test = suggestedRoasTarget(c.margin, AGGRESSIVE_MARGIN_SHARE);
    const canTest = !tooStrict && c.roasTarget !== null && test !== null && be !== null && test < c.roasTarget;
    out.push({
      code: "rank_limited",
      severity: "warning",
      message: tooStrict
        ? `Perde ${lost} das exibições por classificação: o ROAS objetivo de ${x(c.roasTarget!)} é mais exigente que o necessário. ${x(sug!)} ainda dá lucro e deve aparecer mais.`
        : canTest
          ? `Perde ${lost} das exibições por classificação no leilão. Seu ROAS objetivo (${x(c.roasTarget!)}) já deixa boa margem: para aparecer mais, teste ${x(test!)} por 14 dias (ainda acima do equilíbrio de ${x(be!)}, com lucro menor por venda) e melhore foto principal, preço e frete grátis dos anúncios.`
          : `Perde ${lost} das exibições por classificação no leilão. Melhore foto principal, preço e frete grátis dos anúncios para ganhar posição.`,
      suggest: tooStrict ? { roasTarget: sug! } : canTest ? { roasTarget: test! } : undefined,
    });
  }
  if (t.acos !== null && c.acosBenchmark && t.acos > c.acosBenchmark * 1.3 && c.cost >= 30) {
    out.push({
      code: "above_benchmark",
      severity: "warning",
      message: `ACOS de ${pct(t.acos)}, acima da referência de ${pct(c.acosBenchmark)} para campanhas parecidas no Mercado Livre.`,
    });
  }
  const acos7 = c.week.revenue > 0 ? c.week.cost / c.week.revenue : null;
  const acosPrev = c.prevWeek.revenue > 0 ? c.prevWeek.cost / c.prevWeek.revenue : null;
  if (acos7 !== null && acosPrev !== null && c.week.cost >= 20 && acos7 > acosPrev * 1.3) {
    out.push({
      code: "getting_worse",
      severity: "warning",
      message: `ACOS piorou na última semana: ${pct(acosPrev)} → ${pct(acos7)}.`,
    });
  }
  if (!out.length) out.push({ code: "ok", severity: "info", message: "Sem problemas detectados." });
  return out;
}

// ---------------------------------------------------------------------------
// Decisão por anúncio: o que fazer com cada produto anunciado.

export type AdDecision = "escalar" | "manter" | "reduzir" | "pausar" | "revisar" | "cadastrar_custo";

export interface AdDecisionInput extends AdsMetricsInput {
  margin: number | null;
  stock: number | null;
  itemStatus: string | null;
}

export function adDecision(i: AdDecisionInput): { decision: AdDecision; reason: string; suggestRoasTarget: number | null } {
  const t = adsTotals([i]);
  const be = breakEvenRoas(i.margin);
  const sug = suggestedRoasTarget(i.margin);
  if (i.stock === 0 && i.cost > 0) return { decision: "pausar", reason: "Sem estoque: tire da campanha até repor.", suggestRoasTarget: null };
  if (i.itemStatus && i.itemStatus !== "active" && i.cost > 0) {
    return { decision: "pausar", reason: "O anúncio não está ativo no Mercado Livre.", suggestRoasTarget: null };
  }
  if (i.revenue === 0 && i.cost > 0 && (i.clicks >= 20 || i.cost >= 30)) {
    return { decision: "pausar", reason: `${brl(i.cost)} em ${i.clicks} cliques sem venda.`, suggestRoasTarget: null };
  }
  if (t.roas !== null && be !== null && t.roas < be) {
    return {
      decision: "reduzir",
      reason: `ROAS ${x(t.roas)} abaixo do equilíbrio ${x(be)}. Mova para uma campanha com ROAS objetivo de ${x(sug!)} ou mais.`,
      suggestRoasTarget: sug,
    };
  }
  if (t.ctr !== null && i.prints >= 1000 && t.ctr < 0.002) {
    return { decision: "revisar", reason: `CTR de ${pct(t.ctr)}: melhore foto principal, título ou preço.`, suggestRoasTarget: null };
  }
  if (i.margin === null && i.cost > 0) {
    return { decision: "cadastrar_custo", reason: "Cadastre o custo para saber se o anúncio dá lucro.", suggestRoasTarget: null };
  }
  if (t.roas !== null && be !== null && t.roas >= be * 2 && i.units >= 2) {
    return { decision: "escalar", reason: `ROAS ${x(t.roas)}, o dobro do equilíbrio (${x(be)}). Dá para investir mais.`, suggestRoasTarget: null };
  }
  return { decision: "manter", reason: be !== null && t.roas !== null ? `ROAS ${x(t.roas)} acima do equilíbrio ${x(be)}.` : "Sem dados suficientes para mudar.", suggestRoasTarget: null };
}
