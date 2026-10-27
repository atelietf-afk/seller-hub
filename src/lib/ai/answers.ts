import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ANSWER_MAX } from "@/lib/analytics/answers";

export interface AnswerDraft {
  answer: string;
  confidence: "alta" | "media" | "baixa";
  /** Informações que faltaram para responder com segurança (o vendedor completa). */
  missing: string[];
}

export interface AnswerContext {
  question: string;
  item: {
    title: string;
    price: number;
    condition: string | null;
    availableQuantity: number;
    freeShipping: boolean;
    full: boolean;
    attributes: string[]; // "Nome: valor"
    saleTerms: string[]; // garantia, prazo de fabricação...
    description: string | null;
  };
  storeInfo: string | null;
  pastAnswers: { question: string; answer: string }[];
}

const client = new Anthropic();

const SYSTEM = `Você escreve a resposta de um vendedor do Mercado Livre para a pergunta de um comprador, em português do Brasil.
Tom: cordial, direto e seguro, como um bom vendedor. Comece cumprimentando ("Olá!") e termine se colocando à disposição. Em geral 2 a 4 frases.
Use SOMENTE as informações recebidas (anúncio, ficha técnica, descrição, informações da loja, respostas anteriores). NUNCA invente característica, compatibilidade, prazo, garantia, estoque ou condição.
Se a informação não estiver nos dados, escreva a resposta com um marcador entre colchetes no lugar do dado, por exemplo "[confirmar voltagem]", liste o que falta em "missing" e use confiança "baixa".
Proibido: telefone, e-mail, links, redes sociais, WhatsApp ou pedir para o comprador falar fora do Mercado Livre; prometer desconto que não está no anúncio.
"confidence": "alta" quando os dados respondem tudo; "media" quando responde, mas com alguma suposição razoável; "baixa" quando falta informação.`;

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    confidence: { type: "string", enum: ["alta", "media", "baixa"] },
    missing: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "confidence", "missing"],
  additionalProperties: false,
} as const;

export async function draftAnswer(ctx: AnswerContext): Promise<AnswerDraft> {
  const input = {
    ...ctx,
    item: { ...ctx.item, description: ctx.item.description?.slice(0, 4000) ?? null },
    pastAnswers: ctx.pastAnswers.slice(0, 8),
  };
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou responder");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Resposta sem texto");
  const draft = JSON.parse(text.text) as AnswerDraft;
  return { ...draft, answer: draft.answer.trim().slice(0, ANSWER_MAX) };
}
