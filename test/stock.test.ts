import { describe, expect, it } from "vitest";
import { stockBody } from "@/lib/lojaintegrada/payload";

describe("estoque enviado à Loja Integrada", () => {
  it("manda a quantidade do estoque único, gerenciada pela loja e indisponível quando zera", () => {
    expect(stockBody(7)).toEqual({ gerenciado: true, quantidade: 7, situacao_em_estoque: 0, situacao_sem_estoque: -1 });
    expect(stockBody(0).quantidade).toBe(0);
  });
});
