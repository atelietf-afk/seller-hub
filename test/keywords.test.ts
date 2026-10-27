import { describe, expect, it } from "vitest";
import { competitorTermGaps, coversKeyword, normalize, parseListingId, pricePosition, trendGaps } from "@/lib/analytics/keywords";

describe("normalização", () => {
  it("tira acento, pontuação e caixa", () => {
    expect(normalize("Fone Bluetooth – Cancelamento de Ruído!")).toBe("fone bluetooth cancelamento de ruido");
  });

  it("cobre a busca mesmo com plural e acento", () => {
    expect(coversKeyword("Fones de Ouvido Bluetooth Sem Fio", "fone de ouvido bluetooth")).toBe(true);
    expect(coversKeyword("Carregadores Turbo", "carregador turbo")).toBe(true);
    expect(coversKeyword("Capas para iPhone", "capa iphone")).toBe(true);
    expect(coversKeyword("Fone de ouvido com fio", "fone bluetooth")).toBe(false);
  });
});

describe("trendGaps", () => {
  const trends = [
    { keyword: "fone bluetooth", position: 1 },
    { keyword: "fone sem fio", position: 2 },
    { keyword: "smartwatch", position: 3 },
    { keyword: "fone jbl", position: 4 },
  ];

  it("lista buscas relacionadas que o título não cobre, na ordem de popularidade", () => {
    const gaps = trendGaps("Fone de Ouvido Bluetooth X200", trends);
    expect(gaps.map((g) => g.keyword)).toEqual(["fone sem fio", "fone jbl"]);
    expect(gaps[0].missing).toEqual(["sem", "fio"]);
  });

  it("ignora buscas sem relação com o anúncio", () => {
    expect(trendGaps("Fone Bluetooth", trends).some((g) => g.keyword === "smartwatch")).toBe(false);
  });
});

describe("competitorTermGaps", () => {
  const top = [
    "Fone De Ouvido Bluetooth Sem Fio Com Microfone",
    "Fone Bluetooth Sem Fio Cancelamento De Ruído",
    "Fone Sem Fio Bluetooth 5.3 Microfone",
    "Headphone Bluetooth Sem Fio",
  ];

  it("encontra termos que a maioria usa e o vendedor não", () => {
    const gaps = competitorTermGaps("Fone Bluetooth X200", top);
    const terms = gaps.map((g) => g.term);
    expect(terms).toContain("sem fio");
    expect(terms).toContain("microfone");
    expect(terms).not.toContain("bluetooth");
    expect(terms).not.toContain("fio"); // já representado por "sem fio"
    expect(terms).not.toContain("bluetooth sem"); // pedaço sem sentido: "bluetooth" já está no título
  });

  it("par só entra quando as duas palavras faltam e andam juntas", () => {
    const gaps = competitorTermGaps("Capinha iPhone 15 Silicone", [
      "Capinha Capa iPhone 15 Silicone Aveludada Magsafe",
      "Capa iPhone 15 Anti Impacto Magsafe",
    ]).map((g) => g.term);
    expect(gaps).toContain("capa");
    expect(gaps).toContain("magsafe");
    expect(gaps).not.toContain("capinha capa");
    expect(gaps).not.toContain("silicone aveludada");
  });

  it("sem concorrentes não sugere nada", () => {
    expect(competitorTermGaps("Fone", [])).toEqual([]);
  });
});

describe("pricePosition", () => {
  it("compara com a mediana dos mais vendidos", () => {
    const p = pricePosition(120, [80, 100, 110, 150])!;
    expect(p.median).toBe(105);
    expect(p.cheaperShare).toBe(0.75);
    expect(p.diffFromMedian).toBeCloseTo(0.1429, 3);
  });

  it("sem preços não compara", () => {
    expect(pricePosition(100, [])).toBeNull();
  });
});

describe("parseListingId", () => {
  it("lê links e códigos de anúncio e de produto de catálogo", () => {
    expect(parseListingId("https://produto.mercadolivre.com.br/MLB-1234567890-fone-bluetooth-_JM")).toEqual({ kind: "item", id: "MLB1234567890" });
    expect(parseListingId("MLB1234567890")).toEqual({ kind: "item", id: "MLB1234567890" });
    expect(parseListingId("https://www.mercadolivre.com.br/fone-x/p/MLB19876543?pdp_filters=item_id:MLB1")).toEqual({ kind: "product", id: "MLB19876543" });
    expect(parseListingId("qualquer coisa")).toBeNull();
  });
});
