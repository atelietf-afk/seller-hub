// Períodos de relatório no horário de Brasília (UTC−3, sem horário de verão desde 2019).

const DAY = 86_400_000;
const BRT_OFFSET = 3 * 3_600_000;

/** Data local (AAAA-MM-DD) de um instante. */
export function localDay(t: Date | string | number): string {
  return new Date(new Date(t).getTime() - BRT_OFFSET).toISOString().slice(0, 10);
}

/** Meia-noite local da data AAAA-MM-DD, como instante UTC. */
export function localMidnight(day: string): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + BRT_OFFSET);
}

const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

export type ReportKind = "weekly" | "monthly";

export interface Period {
  kind: ReportKind;
  start: string; // primeiro dia (inclusive)
  end: string; // último dia (inclusive)
}

/** Última semana completa (segunda a domingo) antes de `now`. */
export function lastCompleteWeek(now: Date): Period {
  const today = localDay(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const thisMonday = addDays(today, -((dow + 6) % 7));
  return { kind: "weekly", start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
}

/** Último mês completo antes de `now`. */
export function lastCompleteMonth(now: Date): Period {
  const today = localDay(now);
  const firstThis = `${today.slice(0, 7)}-01`;
  const end = addDays(firstThis, -1);
  return { kind: "monthly", start: `${end.slice(0, 7)}-01`, end };
}

export function periodDays(p: { start: string; end: string }): number {
  return Math.round((localMidnight(p.end).getTime() - localMidnight(p.start).getTime()) / DAY) + 1;
}

/** Instantes [início, fim) do período, para consultas no banco. */
export function periodRange(p: { start: string; end: string }): { from: Date; to: Date } {
  return { from: localMidnight(p.start), to: localMidnight(addDays(p.end, 1)) };
}

/** Período anterior de mesmo tamanho (mês anterior inteiro para relatórios mensais). */
export function previousPeriod(p: Period): Period {
  if (p.kind === "monthly") return lastCompleteMonth(localMidnight(p.start));
  return { kind: p.kind, start: addDays(p.start, -7), end: addDays(p.start, -1) };
}

export function periodLabel(p: { kind: ReportKind; start: string; end: string }): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });
  if (p.kind === "monthly") {
    const s = fmt(p.start, { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return `${fmt(p.start, { day: "2-digit", month: "2-digit" })} a ${fmt(p.end, { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}
