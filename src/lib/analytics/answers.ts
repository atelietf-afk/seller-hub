// Regras do Mercado Livre para respostas: até 2.000 caracteres e nada de dados de
// contato (telefone, e-mail, links, redes sociais). Respostas assim são recusadas
// ou rendem punição na conta, então bloqueamos antes de enviar.

export const ANSWER_MAX = 2000;

export interface AnswerProblem {
  code: "empty" | "too_long" | "phone" | "email" | "link" | "social";
  message: string;
}

const PATTERNS: { code: AnswerProblem["code"]; re: RegExp; message: string }[] = [
  { code: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/i, message: "Tem um e-mail. O Mercado Livre proíbe dados de contato." },
  {
    code: "link",
    re: /(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|net|org|br|shop|store|app)(\.br)?\b/i,
    message: "Tem um link ou site. O Mercado Livre proíbe direcionar o comprador para fora.",
  },
  { code: "social", re: /\b(whats\s?app|zap|wpp|instagram|insta|telegram|facebook|tiktok)\b|@\w{3,}/i, message: "Cita rede social ou WhatsApp. O Mercado Livre proíbe." },
  // 8+ dígitos seguidos (com espaço, ponto, hífen ou parênteses no meio) parecem telefone.
  { code: "phone", re: /(\+?\d[\s().-]*){8,}/, message: "Parece ter um telefone. O Mercado Livre proíbe dados de contato." },
];

export function answerProblems(text: string): AnswerProblem[] {
  const t = text.trim();
  if (!t) return [{ code: "empty", message: "A resposta está vazia." }];
  const out: AnswerProblem[] = [];
  if (t.length > ANSWER_MAX) out.push({ code: "too_long", message: `Passa de ${ANSWER_MAX} caracteres (${t.length}).` });
  for (const p of PATTERNS) if (p.re.test(t)) out.push({ code: p.code, message: p.message });
  return out;
}

/** Há quanto tempo o comprador espera, e se está atrasado. */
export function waitingSeverity(askedAt: string | Date, now = new Date()): "info" | "warning" | "critical" {
  const h = (now.getTime() - new Date(askedAt).getTime()) / 3_600_000;
  return h >= 12 ? "critical" : h >= 1 ? "warning" : "info";
}
