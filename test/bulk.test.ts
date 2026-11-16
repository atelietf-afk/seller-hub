import { describe, expect, it } from "vitest";
import { BULK_MAX_PRODUCTS, bulkProblems, isBulkAction } from "@/lib/analytics/bulk";

describe("atualização em massa", () => {
  it("só aceita as ações conhecidas", () => {
    expect(isBulkAction("preco")).toBe(true);
    expect(isBulkAction("apagar")).toBe(false);
  });

  it("exige seleção e um limite de produtos por vez", () => {
    expect(bulkProblems("ativar", 0, null)[0]).toMatch(/pelo menos um/);
    expect(bulkProblems("ativar", BULK_MAX_PRODUCTS + 1, null)[0]).toMatch(/200/);
    expect(bulkProblems("ativar", 3, null)).toEqual([]);
  });

  it("valida o preço e o estoque informados", () => {
    expect(bulkProblems("preco", 2, 0)[0]).toMatch(/maior que zero/);
    expect(bulkProblems("preco", 2, 49.9)).toEqual([]);
    expect(bulkProblems("estoque", 2, 1.5)[0]).toMatch(/inteira/);
    expect(bulkProblems("estoque", 2, -1)[0]).toMatch(/inteira/);
    expect(bulkProblems("estoque", 2, 0)).toEqual([]);
  });
});
