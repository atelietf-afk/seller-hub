import { describe, expect, it } from "vitest";
import { formatWhatsappPhone, normalizeWhatsappPhone, reportMessage, templateText } from "@/lib/analytics/whatsapp";
import type { PeriodReportData, PeriodTotals } from "@/lib/period-report";

describe("normalizeWhatsappPhone", () => {
  it("aceita o número do jeito que a pessoa digita", () => {
    expect(normalizeWhatsappPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizeWhatsappPhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizeWhatsappPhone("0055 11 987654321")).toBe("5511987654321");
    expect(normalizeWhatsappPhone("62 3333-4444")).toBe("556233334444");
  });

  it("recusa número curto, DDD inválido ou de outro país", () => {
    expect(normalizeWhatsappPhone("98765-4321")).toBeNull();
    expect(normalizeWhatsappPhone("(01) 98765-4321")).toBeNull();
    expect(normalizeWhatsappPhone("+1 415 555 0100")).toBeNull();
    expect(normalizeWhatsappPhone("")).toBeNull();
  });

  it("mostra o número formatado", () => {
    expect(formatWhatsappPhone("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(formatWhatsappPhone("556233334444")).toBe("+55 (62) 3333-4444");
  });
});

describe("templateText", () => {
  it("tira quebras de linha e espaços seguidos (a Meta recusa)", () => {
    expect(templateText("a\nb\t c     d")).toBe("a b c d");
  });
  it("corta textos longos e nunca manda vazio", () => {
    expect(templateText("x".repeat(400), 10)).toBe(`${"x".repeat(9)}…`);
    expect(templateText("  ")).toBe("-");
  });
});

const totals = (o: Partial<PeriodTotals>): PeriodTotals => ({
  revenue: 0, orders: 0, units: 0, avgTicket: 0, profit: 0, margin: 0, fees: 0, shipping: 0, tax: 0, productCost: 0,
  visits: 0, conversion: 0, adCost: 0, adRevenue: 0, acos: null, tacos: null, profitAfterAds: 0, ...o,
});

const report = (o: Partial<PeriodReportData> = {}): PeriodReportData => ({
  period: { kind: "weekly", start: "2026-10-19", end: "2026-10-25" },
  previousPeriod: { kind: "weekly", start: "2026-10-12", end: "2026-10-18" },
  nickname: "loja",
  incompleteSince: null,
  totals: totals({ revenue: 1500, orders: 12, profitAfterAds: 320.5 }),
  previous: totals({ revenue: 1200 }),
  daily: [],
  topProducts: [],
  movers: { up: [], down: [] },
  problems: [],
  missingCosts: 0,
  unansweredQuestions: 0,
  ...o,
});

describe("reportMessage", () => {
  it("monta os 7 parâmetros e o link do botão", () => {
    const m = reportMessage(report(), { headline: "Vendas subiram\npor causa do anúncio X.", highlights: [], actions: [] });
    expect(m.buttonSuffix).toBe("weekly/2026-10-19");
    expect(m.body).toHaveLength(7);
    expect(m.body[0]).toBe("semanal");
    expect(m.body[1]).toBe("19/10 a 25/10/2026");
    expect(m.body[2]).toMatch(/^R\$\s1\.500,00$/);
    expect(m.body[3]).toBe("+25% vs período anterior");
    expect(m.body[4]).toBe("12");
    expect(m.body[5]).toMatch(/^R\$\s320,50$/);
    expect(m.body[6]).toBe("Vendas subiram por causa do anúncio X.");
    for (const p of m.body) expect(p).not.toMatch(/\n|\t| {5}/);
  });

  it("avisa quando falta custo e usa o principal problema sem análise da IA", () => {
    const m = reportMessage(
      report({
        period: { kind: "monthly", start: "2026-09-01", end: "2026-09-30" },
        totals: totals({ revenue: 0, profitAfterAds: 0 }),
        previous: totals({ revenue: 0 }),
        missingCosts: 3,
        problems: [{ itemId: "MLB1", title: "Caneca", severity: "critical", message: "Sem estoque" }],
      }),
      null,
    );
    expect(m.body[0]).toBe("mensal");
    expect(m.body[1]).toBe("Setembro de 2026");
    expect(m.body[3]).toBe("igual ao período anterior");
    expect(m.body[5]).toContain("falta custo em 3 anúncio(s)");
    expect(m.body[6]).toBe("Atenção: Caneca: Sem estoque");
    expect(m.buttonSuffix).toBe("monthly/2026-09-01");
  });

  it("mostra queda com sinal de menos", () => {
    const m = reportMessage(report({ totals: totals({ revenue: 900 }), previous: totals({ revenue: 1200 }) }), null);
    expect(m.body[3]).toBe("−25% vs período anterior");
  });
});
