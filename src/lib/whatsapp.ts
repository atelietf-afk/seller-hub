import "server-only";
import type { ReportMessage } from "./analytics/whatsapp";

// Envio pela API oficial do WhatsApp (Cloud API da Meta). Mensagem iniciada pela
// empresa precisa de modelo aprovado; o nome e o idioma vêm do ambiente.

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const KNOWN: Record<number, string> = {
  190: "o token do WhatsApp expirou ou é inválido",
  131030: "este número não está na lista de destinatários de teste do app na Meta",
  131026: "a mensagem não pôde ser entregue a este número (ele usa WhatsApp?)",
  132000: "o número de variáveis não bate com o modelo aprovado",
  132001: "o modelo de mensagem não existe ou ainda não foi aprovado",
  132012: "o formato das variáveis não bate com o modelo aprovado",
};

export class WhatsappError extends Error {
  /** Resposta da Meta, para o log (ex.: qual nome/idioma de modelo não existe). */
  constructor(
    message: string,
    public detail: string,
  ) {
    super(message);
  }
}

export async function sendReportTemplate(to: string, msg: ReportMessage): Promise<string> {
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE || "relatorio_vendas",
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
        components: [
          { type: "body", parameters: msg.body.map((text) => ({ type: "text", text })) },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.buttonSuffix }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as {
    messages?: { id: string }[];
    error?: { code?: number; message?: string; error_data?: { details?: string } };
  } | null;
  const id = json?.messages?.[0]?.id;
  if (res.ok && id) return id;
  const e = json?.error;
  const known = e?.code !== undefined ? KNOWN[e.code] : undefined;
  const detail = `${res.status} código ${e?.code ?? "?"}: ${e?.message ?? ""} ${e?.error_data?.details ?? ""}`.trim();
  throw new WhatsappError(known ?? `WhatsApp respondeu ${res.status}: ${e?.error_data?.details ?? e?.message ?? "erro desconhecido"}`, detail);
}
