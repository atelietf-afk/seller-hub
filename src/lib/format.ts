export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (n: number, digits = 1) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
/** Número para campo de formulário: 20,5 → "20,50". */
export const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/** Lê valor digitado em reais: aceita "1.234,56", "1234,56", "20.5" e "20". */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const int = (n: number) => n.toLocaleString("pt-BR");

// Datas sempre no horário de Brasília: o servidor da Vercel roda em UTC.
const TZ = "America/Sao_Paulo";
/** 27/10/2026, 20:47:48 */
export const dateTime = (t: string | Date) => new Date(t).toLocaleString("pt-BR", { timeZone: TZ });
/** 27/10/2026 */
export const dateOnly = (t: string | Date) => new Date(t).toLocaleDateString("pt-BR", { timeZone: TZ });

/** Variação percentual com sinal, ou null se não houver base de comparação. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}
