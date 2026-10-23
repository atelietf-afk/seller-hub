// Funil por anúncio (visitas → vendas) e diagnóstico de onde ele quebra.

export interface ItemFunnelInput {
  itemId: string;
  title: string;
  status: string;
  visits: number;        // visitas no período
  orders: number;        // pedidos no período
  units: number;         // unidades vendidas no período
  stock: number;
  periodDays: number;
  margin: number | null; // margem média no período; null se não houver custo
}

export type DiagnosisCode =
  | "paused"
  | "out_of_stock"
  | "low_traffic"
  | "low_conversion"
  | "hidden_gem"
  | "stock_risk"
  | "low_margin"
  | "healthy";

export interface Diagnosis {
  code: DiagnosisCode;
  severity: "info" | "warning" | "critical" | "success";
  message: string;
}

export interface ItemFunnel extends ItemFunnelInput {
  conversion: number;            // pedidos / visitas
  stockDays: number | null;      // quantos dias o estoque aguenta no ritmo atual
  diagnoses: Diagnosis[];
}

export interface FunnelThresholds {
  lowStockDays: number;
  minMargin: number;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compara cada anúncio com a mediana da própria conta: o que é "pouca visita" ou
 * "conversão baixa" depende do tamanho da loja, então não usamos números fixos.
 */
export function analyzeFunnel(items: ItemFunnelInput[], t: FunnelThresholds): ItemFunnel[] {
  const active = items.filter((i) => i.status === "active");
  const medVisits = median(active.map((i) => i.visits));
  const withTraffic = active.filter((i) => i.visits >= 30);
  const medConversion = median(withTraffic.map((i) => i.orders / i.visits));

  return items.map((i) => {
    const conversion = i.visits > 0 ? i.orders / i.visits : 0;
    const dailyUnits = i.units / Math.max(i.periodDays, 1);
    const stockDays = dailyUnits > 0 ? i.stock / dailyUnits : null;
    const diagnoses: Diagnosis[] = [];

    if (i.status !== "active") {
      diagnoses.push({ code: "paused", severity: "warning", message: "Anúncio não está ativo: não aparece nas buscas." });
    } else if (i.stock === 0) {
      diagnoses.push({ code: "out_of_stock", severity: "critical", message: "Sem estoque: você está perdendo vendas agora." });
    } else {
      if (stockDays !== null && stockDays < t.lowStockDays) {
        diagnoses.push({
          code: "stock_risk",
          severity: "critical",
          message: `Estoque acaba em ~${Math.max(1, Math.round(stockDays))} dia(s) no ritmo atual. Reponha já.`,
        });
      }
      const fewVisits = medVisits > 0 && i.visits < medVisits * 0.5;
      const goodConversion = medConversion > 0 && conversion >= medConversion * 1.5 && i.orders >= 2;
      const badConversion = i.visits >= 30 && medConversion > 0 && conversion < medConversion * 0.5;

      if (fewVisits && goodConversion) {
        diagnoses.push({
          code: "hidden_gem",
          severity: "success",
          message: "Converte bem, mas recebe pouca visita. Bom candidato para Product Ads e para melhorar o título.",
        });
      } else if (fewVisits) {
        diagnoses.push({
          code: "low_traffic",
          severity: "warning",
          message: "Pouca visita: revise título, palavras-chave, categoria e ficha técnica.",
        });
      }
      if (badConversion) {
        diagnoses.push({
          code: "low_conversion",
          severity: "warning",
          message: "Muita visita e pouca venda: compare preço, frete, fotos e perguntas sem resposta.",
        });
      }
    }
    if (i.margin !== null && i.orders > 0 && i.margin < t.minMargin) {
      diagnoses.push({
        code: "low_margin",
        severity: i.margin < 0 ? "critical" : "warning",
        message:
          i.margin < 0
            ? `Prejuízo: margem de ${(i.margin * 100).toFixed(1)}% por venda.`
            : `Margem baixa: ${(i.margin * 100).toFixed(1)}% por venda.`,
      });
    }
    if (!diagnoses.length) diagnoses.push({ code: "healthy", severity: "info", message: "Sem problemas detectados." });

    return { ...i, conversion, stockDays, diagnoses };
  });
}
