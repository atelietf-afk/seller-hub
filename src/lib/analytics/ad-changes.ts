import { parseMoney } from "@/lib/format";
import { ROAS_MAX, ROAS_MIN } from "./ads";
import { localDay } from "./periods";

// Mudanças em campanhas feitas pelo Seller Hub e o efeito medido depois.
//
// O efeito compara os 7 dias antes da mudança com os 7 e os 14 dias depois. O Mercado
// Livre atribui vendas ao anúncio em até 14 dias, então o de 7 dias é uma prévia.

export const BUDGET_MIN = 1;
export const BUDGET_MAX = 5000;

export type ChangeField = "budget" | "roas_target" | "status";

export function parseBudget(raw: string): number | null {
  const n = parseMoney(raw);
  if (n === null || n < BUDGET_MIN || n > BUDGET_MAX) return null;
  return Math.round(n * 100) / 100;
}

export function parseRoas(raw: string): number | null {
  const n = Number(raw.replace(",", ".").replace(/x$/i, "").trim());
  if (!Number.isFinite(n) || n < ROAS_MIN || n > ROAS_MAX) return null;
  return Math.round(n * 100) / 100;
}

export interface DayMetrics {
  day: string; // AAAA-MM-DD
  cost: number;
  revenue: number;
}

export interface EffectWindow {
  days: number;
  cost: number;
  revenue: number;
  roas: number | null;
}

export interface ChangeEffect {
  before: EffectWindow;
  /** null enquanto não passaram os dias da janela. */
  after7: EffectWindow | null;
  after14: EffectWindow | null;
  daysSince: number;
}

const DAY = 86_400_000;
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

function window(daily: DayMetrics[], from: string, to: string): EffectWindow {
  let cost = 0;
  let revenue = 0;
  for (const d of daily) {
    if (d.day >= from && d.day <= to) {
      cost += d.cost;
      revenue += d.revenue;
    }
  }
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY) + 1;
  return { days, cost: Math.round(cost * 100) / 100, revenue: Math.round(revenue * 100) / 100, roas: cost > 0 ? revenue / cost : null };
}

/**
 * Efeito de uma mudança feita em `changedAt`. O dia da mudança fica de fora das duas
 * janelas (metade antes, metade depois). Os dados do ML vão até ontem.
 */
export function changeEffect(daily: DayMetrics[], changedAt: string, now: Date): ChangeEffect {
  const changed = localDay(changedAt);
  const lastFullDay = addDays(localDay(now), -1);
  const daysSince = Math.max(0, Math.round((new Date(`${lastFullDay}T00:00:00Z`).getTime() - new Date(`${changed}T00:00:00Z`).getTime()) / DAY));
  const after = (n: number) => (daysSince >= n ? window(daily, addDays(changed, 1), addDays(changed, n)) : null);
  return { before: window(daily, addDays(changed, -7), addDays(changed, -1)), after7: after(7), after14: after(14), daysSince };
}
