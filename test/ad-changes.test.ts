import { describe, expect, it } from "vitest";
import { changeEffect, parseBudget, parseRoas } from "@/lib/analytics/ad-changes";

describe("valores digitados", () => {
  it("orçamento em reais, dentro dos limites", () => {
    expect(parseBudget("30")).toBe(30);
    expect(parseBudget("12,50")).toBe(12.5);
    expect(parseBudget("1.250,00")).toBe(1250);
    expect(parseBudget("12.5")).toBe(12.5);
    expect(parseBudget("R$ 40")).toBe(40);
    expect(parseBudget("0")).toBeNull();
    expect(parseBudget("abc")).toBeNull();
    expect(parseBudget("99999")).toBeNull();
  });
  it("ROAS objetivo entre 1x e 35x", () => {
    expect(parseRoas("4,5")).toBe(4.5);
    expect(parseRoas("6x")).toBe(6);
    expect(parseRoas("0.5")).toBeNull();
    expect(parseRoas("40")).toBeNull();
  });
});

describe("changeEffect", () => {
  // um dia por linha, de 01/10 a 31/10: antes da mudança (dia 10) custo 10 e venda 40; depois custo 10 e venda 80
  const daily = Array.from({ length: 31 }, (_, i) => {
    const day = `2026-10-${String(i + 1).padStart(2, "0")}`;
    return { day, cost: 10, revenue: day <= "2026-10-10" ? 40 : 80 };
  });
  const changedAt = "2026-10-10T15:00:00Z"; // 12h em Brasília

  it("compara 7 dias antes com 7 e 14 depois, sem o dia da mudança", () => {
    const e = changeEffect(daily, changedAt, new Date("2026-10-28T15:00:00Z"));
    expect(e.before).toEqual({ days: 7, cost: 70, revenue: 280, roas: 4 });
    expect(e.after7).toEqual({ days: 7, cost: 70, revenue: 560, roas: 8 });
    expect(e.after14?.revenue).toBe(1120);
    expect(e.daysSince).toBe(17);
  });

  it("espera os dias passarem antes de mostrar o depois", () => {
    const e = changeEffect(daily, changedAt, new Date("2026-10-15T15:00:00Z"));
    expect(e.daysSince).toBe(4);
    expect(e.after7).toBeNull();
    expect(e.after14).toBeNull();
    expect(changeEffect(daily, changedAt, new Date("2026-10-18T15:00:00Z")).after7).not.toBeNull();
  });

  it("sem investimento o ROAS fica vazio", () => {
    expect(changeEffect([], changedAt, new Date("2026-10-28T15:00:00Z")).before).toEqual({ days: 7, cost: 0, revenue: 0, roas: null });
  });
});
