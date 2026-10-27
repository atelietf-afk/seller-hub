import { describe, expect, it } from "vitest";
import { lastCompleteMonth, lastCompleteWeek, localDay, periodDays, periodLabel, periodRange, previousPeriod } from "@/lib/analytics/periods";

describe("períodos (horário de Brasília)", () => {
  it("usa a data local, não a UTC", () => {
    expect(localDay("2026-10-28T02:00:00Z")).toBe("2026-10-27"); // 23h em Brasília
  });

  it("última semana completa é de segunda a domingo", () => {
    // terça, 27/10/2026
    expect(lastCompleteWeek(new Date("2026-10-27T15:00:00Z"))).toEqual({ kind: "weekly", start: "2026-10-19", end: "2026-10-25" });
    // segunda 01h em Brasília ainda conta a semana que acabou ontem
    expect(lastCompleteWeek(new Date("2026-10-26T04:00:00Z"))).toEqual({ kind: "weekly", start: "2026-10-19", end: "2026-10-25" });
    // domingo: a semana atual ainda não acabou
    expect(lastCompleteWeek(new Date("2026-10-25T15:00:00Z"))).toEqual({ kind: "weekly", start: "2026-10-12", end: "2026-10-18" });
  });

  it("último mês completo, inclusive virada de ano e fevereiro", () => {
    expect(lastCompleteMonth(new Date("2026-10-27T15:00:00Z"))).toEqual({ kind: "monthly", start: "2026-09-01", end: "2026-09-30" });
    expect(lastCompleteMonth(new Date("2027-01-01T05:00:00Z"))).toEqual({ kind: "monthly", start: "2026-12-01", end: "2026-12-31" });
    expect(lastCompleteMonth(new Date("2028-03-02T12:00:00Z")).end).toBe("2028-02-29");
  });

  it("calcula dias, intervalo e período anterior", () => {
    const sep = { kind: "monthly" as const, start: "2026-09-01", end: "2026-09-30" };
    expect(periodDays(sep)).toBe(30);
    expect(periodRange(sep)).toEqual({ from: new Date("2026-09-01T03:00:00Z"), to: new Date("2026-10-01T03:00:00Z") });
    expect(previousPeriod(sep)).toEqual({ kind: "monthly", start: "2026-08-01", end: "2026-08-31" });
    expect(previousPeriod({ kind: "weekly", start: "2026-10-19", end: "2026-10-25" })).toEqual({ kind: "weekly", start: "2026-10-12", end: "2026-10-18" });
  });

  it("rótulos em português", () => {
    expect(periodLabel({ kind: "monthly", start: "2026-09-01", end: "2026-09-30" })).toBe("Setembro de 2026");
    expect(periodLabel({ kind: "weekly", start: "2026-10-19", end: "2026-10-25" })).toBe("19/10 a 25/10/2026");
  });
});
