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

export type AdDiagnosisCode = "spend_no_sales" | "losing_money" | "above_target" | "scale" | "low_ctr" | "ok";

export interface AdDiagnosis {
  code: AdDiagnosisCode;
  severity: "info" | "success" | "warning" | "critical";
  message: string;
}

export interface AdDiagnosisInput extends AdsMetricsInput {
  /** Margem do produto antes dos anúncios (lucro/faturamento). null se não há custo cadastrado. */
  marginBeforeAds: number | null;
  /** ACOS alvo da campanha, em fração. */
  acosTarget?: number | null;
}

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function diagnoseAd(i: AdDiagnosisInput): AdDiagnosis[] {
  const t = adsTotals([i]);
  const out: AdDiagnosis[] = [];

  if (i.revenue === 0 && i.cost > 0 && (i.clicks >= 20 || i.cost >= 30)) {
    out.push({
      code: "spend_no_sales",
      severity: "critical",
      message: `Gastou ${i.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${i.clicks} cliques sem nenhuma venda. Pause ou revise preço, fotos e título.`,
    });
  } else if (t.acos !== null && i.marginBeforeAds !== null) {
    if (t.acos > i.marginBeforeAds) {
      out.push({
        code: "losing_money",
        severity: "critical",
        message: `ACOS de ${pct(t.acos)} passa da margem de ${pct(Math.max(i.marginBeforeAds, 0))}: cada venda pelo anúncio dá prejuízo. Baixe o lance/orçamento ou o ACOS alvo.`,
      });
    } else if (t.acos < i.marginBeforeAds * 0.5 && i.units >= 2) {
      out.push({
        code: "scale",
        severity: "success",
        message: `ACOS de ${pct(t.acos)}, bem abaixo da margem de ${pct(i.marginBeforeAds)}. Dá para aumentar o orçamento e vender mais com lucro.`,
      });
    }
  }
  if (t.acos !== null && i.acosTarget && t.acos > i.acosTarget * 1.2 && !out.some((d) => d.code === "losing_money")) {
    out.push({
      code: "above_target",
      severity: "warning",
      message: `ACOS de ${pct(t.acos)} acima do alvo de ${pct(i.acosTarget)} da campanha.`,
    });
  }
  if (t.ctr !== null && i.prints >= 1000 && t.ctr < 0.002) {
    out.push({
      code: "low_ctr",
      severity: "warning",
      message: `Aparece muito e quase ninguém clica (CTR ${pct(t.ctr)}). Melhore a foto principal, o título ou o preço.`,
    });
  }
  if (!out.length) out.push({ code: "ok", severity: "info", message: "Sem problemas detectados." });
  return out;
}
