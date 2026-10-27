import type { DailySummary } from "@/lib/ai/summary";
import type { PeriodReportData } from "@/lib/period-report";
import { periodLabel } from "./periods";

// Mensagem do relatório no WhatsApp. Fora da janela de 24h a Meta só deixa
// mandar modelo aprovado; os campos variáveis vão em parâmetros de texto.

/** Número de celular brasileiro no formato da API (55 + DDD + número), ou null se não parecer válido. */
export function normalizeWhatsappPhone(input: string): string | null {
  const raw = input.trim();
  let digits = raw.replace(/\D/g, "");
  // Com + ou 00 na frente o número já traz o código do país; sem isso, é um número local.
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!international && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!/^55[1-9][1-9]\d{8,9}$/.test(digits)) return null;
  return digits;
}

/** Mostra o número salvo do jeito que o vendedor reconhece: +55 (11) 98765-4321. */
export function formatWhatsappPhone(phone: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : phone;
}

// Parâmetro de modelo não aceita quebra de linha, tabulação nem mais de 4 espaços seguidos.
export function templateText(s: string, max = 300): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean || "-";
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function changeText(now: number, before: number): string {
  if (before === 0) return now === 0 ? "igual ao período anterior" : "sem vendas no período anterior";
  const v = (now - before) / Math.abs(before);
  const p = Math.abs(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return v === 0 ? "igual ao período anterior" : `${v > 0 ? "+" : "−"}${p}% vs período anterior`;
}

export interface ReportMessage {
  /** Parâmetros {{1}} a {{7}} do corpo do modelo, na ordem. */
  body: string[];
  /** Final do link do botão: relatorios/{kind}/{start}. */
  buttonSuffix: string;
}

/**
 * Corpo do modelo "relatorio_vendas":
 * {{1}} tipo · {{2}} período · {{3}} faturamento · {{4}} variação · {{5}} pedidos · {{6}} lucro após anúncios · {{7}} análise
 */
export function reportMessage(d: PeriodReportData, ai: DailySummary | null): ReportMessage {
  const t = d.totals;
  const profit = d.missingCosts ? `${brl(t.profitAfterAds)} (falta custo em ${d.missingCosts} anúncio(s))` : brl(t.profitAfterAds);
  const analysis = ai?.headline ?? (d.problems[0] ? `Atenção: ${d.problems[0].title}: ${d.problems[0].message}` : "Sem alertas importantes no período.");
  return {
    body: [
      d.period.kind === "monthly" ? "mensal" : "semanal",
      periodLabel(d.period),
      brl(t.revenue),
      changeText(t.revenue, d.previous.revenue),
      t.orders.toLocaleString("pt-BR"),
      profit,
      analysis,
    ].map((s) => templateText(s)),
    buttonSuffix: `${d.period.kind}/${d.period.start}`,
  };
}
