import { describe, expect, it } from "vitest";
import { isPlatform, titleProblems, TITLE_MAX } from "@/lib/analytics/listings";

describe("regras dos anúncios por loja", () => {
  it("aceita só as lojas conhecidas", () => {
    expect(isPlatform("shopee")).toBe(true);
    expect(isPlatform("tiktok")).toBe(false);
  });

  it("confere o limite de cada loja", () => {
    const sessenta = "a".repeat(TITLE_MAX.mercadolivre);
    expect(titleProblems("mercadolivre", sessenta)).toEqual([]);
    expect(titleProblems("mercadolivre", sessenta + "a")[0]).toMatch(/Passa de 60/);
    expect(titleProblems("amazon", "a".repeat(150))).toEqual([]); // Amazon aceita mais que o ML
  });

  it("bloqueia palavras que o Mercado Livre recusa no título", () => {
    expect(titleProblems("mercadolivre", "Caneca personalizada com frete grátis")[0]).toMatch(/promoção, frete ou oferta/);
    expect(titleProblems("shopee", "Caneca personalizada com frete grátis")).toEqual([]);
  });

  it("título vazio nunca passa", () => {
    expect(titleProblems("shopee", "   ")).toEqual(["Título vazio."]);
  });
});
