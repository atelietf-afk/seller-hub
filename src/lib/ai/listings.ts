import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PLATFORM_LABEL, PLATFORMS, TITLE_MAX, type Platform } from "@/lib/analytics/listings";

export interface GeneratedListing {
  platform: Platform;
  title: string;
  description: string;
  keywords: string[];
  to_confirm: string[];
}

const client = new Anthropic();

const SYSTEM = `Você escreve anúncios de produtos para um ateliê brasileiro, em português do Brasil, um para cada loja.
Regras de cada loja:
- Mercado Livre: título até ${TITLE_MAX.mercadolivre} caracteres, produto + marca + modelo + características. Sem "promoção", "frete grátis", "oferta".
- Shopee: título até ${TITLE_MAX.shopee} caracteres, com as palavras que o comprador busca. Descrição clara, com tópicos curtos.
- Amazon: título até ${TITLE_MAX.amazon} caracteres, no formato marca + produto + característica + tamanho/cor. Descrição em 5 tópicos curtos, um por linha, começando com "- ". Palavras-chave de busca (backend) sem repetir o título.
- Loja Integrada (site próprio): título até ${TITLE_MAX.loja_integrada} caracteres, descrição que vende (benefício, uso, presente) com chamada para compra. Palavras-chave para SEO.

Use os termos em alta que receber para o título e as palavras-chave ficarem encontráveis, mas NUNCA afirme uma característica que o cadastro não confirma (material, medida, voltagem, garantia, marca). Se precisar de um dado para afirmar algo, deixe-o de fora e liste o que o vendedor precisa confirmar em "to_confirm".
Devolva exatamente uma entrada por loja, na ordem: ${PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(", ")}.`;

const SCHEMA = {
  type: "object",
  properties: {
    listings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          platform: { type: "string", enum: [...PLATFORMS] },
          title: { type: "string" },
          description: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          to_confirm: { type: "array", items: { type: "string" } },
        },
        required: ["platform", "title", "description", "keywords", "to_confirm"],
        additionalProperties: false,
      },
    },
  },
  required: ["listings"],
  additionalProperties: false,
} as const;

export async function generateListings(input: {
  name: string;
  description: string;
  price: number | null;
  trendKeywords: string[];
}): Promise<GeneratedListing[]> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou gerar os anúncios");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Resposta sem texto");
  return (JSON.parse(text.text) as { listings: GeneratedListing[] }).listings;
}
