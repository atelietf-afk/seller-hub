import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export interface TitleSuggestions {
  titles: { title: string; why: string; verify: string[] }[];
}

const client = new Anthropic();
export const ML_TITLE_MAX = 60;

const SYSTEM = `Você escreve títulos de anúncios do Mercado Livre em português do Brasil.
Regras do Mercado Livre: até ${ML_TITLE_MAX} caracteres; produto + marca + modelo + características principais; sem palavras como "promoção", "frete grátis", "oferta" ou "melhor preço"; sem símbolos ou caixa alta desnecessários.
Use as buscas em alta e os termos dos mais vendidos que recebeu para o título ser encontrado, mas NUNCA afirme uma característica que o título atual não confirma (ex.: "sem fio", "à prova d'água", voltagem, marca). Se usar um termo que o vendedor precisa confirmar, liste-o em "verify".
Devolva 3 opções diferentes, cada uma com o motivo em uma frase curta.`;

const SCHEMA = {
  type: "object",
  properties: {
    titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          verify: { type: "array", items: { type: "string" } },
        },
        required: ["title", "why", "verify"],
        additionalProperties: false,
      },
    },
  },
  required: ["titles"],
  additionalProperties: false,
} as const;

export async function suggestTitles(input: {
  title: string;
  category: string | null;
  price: number;
  trendingSearches: string[];
  bestSellerTerms: string[];
}): Promise<TitleSuggestions> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou sugerir títulos");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Resposta sem texto");
  const parsed = JSON.parse(text.text) as TitleSuggestions;
  // O limite de caracteres é regra do ML: título maior seria recusado.
  return { titles: parsed.titles.filter((t) => t.title.trim().length > 0 && t.title.length <= ML_TITLE_MAX).slice(0, 3) };
}
