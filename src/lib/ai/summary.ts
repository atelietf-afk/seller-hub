import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AccountReport } from "@/lib/report";

export interface DailySummary {
  headline: string;
  highlights: string[];
  actions: { title: string; why: string; itemId: string | null }[];
}

const client = new Anthropic();

const SYSTEM = `Você é o analista de uma loja no Mercado Livre e escreve para o próprio dono da loja, em português do Brasil.
Explique o que aconteceu no período com base apenas nos números recebidos e diga o que fazer agora.
Seja direto e concreto: cite produtos, valores e percentuais. Não invente dados que não estão no JSON.
Se o custo dos produtos não foi informado, o lucro está superestimado: diga isso quando for relevante.
"headline": uma frase com o resultado principal e a causa mais provável.
"highlights": de 2 a 4 fatos que explicam o período.
"actions": de 1 a 3 ações em ordem de impacto, cada uma com o motivo; use o itemId do anúncio quando a ação for sobre um produto.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          itemId: { type: ["string", "null"] },
        },
        required: ["title", "why", "itemId"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "highlights", "actions"],
  additionalProperties: false,
} as const;

/** Só o que o modelo precisa: totais, comparação e os anúncios que mais importam. */
export function summaryInput(r: AccountReport) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const relevant = r.funnel
    .filter((f) => f.revenue > 0 || f.diagnoses.some((d) => d.code !== "healthy"))
    .slice(0, 25)
    .map((f) => ({
      itemId: f.itemId,
      title: f.title,
      status: f.status,
      price: f.price,
      visits: f.visits,
      orders: f.orders,
      conversionPct: Math.round(f.conversion * 1000) / 10,
      revenue: f.revenue,
      profit: f.unitCost ? f.profit : null,
      stock: f.stock,
      stockDays: f.stockDays === null ? null : Math.round(f.stockDays),
      problems: f.diagnoses.filter((d) => d.code !== "healthy").map((d) => d.message),
    }));
  return {
    periodDays: r.periodDays,
    revenue: r.totals.revenue,
    revenueChangePct: pct(r.totals.revenue, r.previous.revenue),
    orders: r.totals.orders,
    ordersChangePct: pct(r.totals.orders, r.previous.orders),
    profit: r.totals.profit,
    margin: Math.round(r.totals.margin * 1000) / 10,
    fees: r.totals.fees,
    shipping: r.totals.shipping,
    visits: r.totals.visits,
    conversionPct: Math.round(r.totals.conversion * 1000) / 10,
    unansweredQuestions: r.unansweredQuestions,
    activeItemsWithoutCost: r.missingCosts,
    items: relevant,
  };
}

export async function generateSummary(report: AccountReport): Promise<DailySummary> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(summaryInput(report)) }],
  });

  if (response.stop_reason === "refusal") throw new Error("O modelo recusou gerar o resumo");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Resposta sem texto");
  return JSON.parse(text.text) as DailySummary;
}
