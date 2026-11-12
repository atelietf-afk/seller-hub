import { describe, expect, it } from "vitest";
import { priceBody, productBody, sameCategory, sendProblems, slugOf, stockBody } from "@/lib/lojaintegrada/payload";

describe("envio à Loja Integrada", () => {
  const p = { name: "Caneca Personalizada & Nome", description: "Cerâmica 300 ml\n\nFeita à mão <3", sku: "CAN-1", price: 49.9, cost: 20 };

  it("gera o endereço do produto sem acento e sem símbolos", () => {
    expect(slugOf("Caneca Personalizada & Nome!")).toBe("caneca-personalizada-nome");
    expect(slugOf("Ateliê Ç")).toBe("atelie-c");
  });

  it("monta o produto inativo, com a descrição em HTML seguro", () => {
    const body = productBody(p);
    expect(body).toMatchObject({
      nome: "Caneca Personalizada & Nome",
      apelido: "caneca-personalizada-nome",
      ativo: false,
      sku: "CAN-1",
      tipo: "normal",
    });
    expect(body.descricao_completa).toBe("<p>Cerâmica 300 ml</p><p>Feita à mão &lt;3</p>");
    expect(body.categorias).toEqual([]);
  });

  it("preço e estoque seguem o formato da API", () => {
    expect(priceBody(p)).toEqual({ cheio: 49.9, custo: 20, promocional: null, sob_consulta: false });
    expect(stockBody(3)).toEqual({ gerenciado: true, quantidade: 3, situacao_em_estoque: 0, situacao_sem_estoque: -1 });
  });

  it("liga o produto à categoria pelo endereço da API e confere o nome sem acento", () => {
    expect(productBody(p, 123).categorias).toEqual(["/api/v1/categoria/123"]);
    expect(sameCategory("Camisetas", " camisetas ")).toBe(true);
    expect(sameCategory("Acessórios", "Acessorios")).toBe(true);
    expect(sameCategory("Camisetas", "Canecas")).toBe(false);
  });

  it("recusa o envio sem SKU ou sem preço", () => {
    expect(sendProblems(p)).toEqual([]);
    expect(sendProblems({ ...p, sku: "  " })[0]).toMatch(/SKU/);
    expect(sendProblems({ ...p, price: null })[0]).toMatch(/preço/);
  });
});
