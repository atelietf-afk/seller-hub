import { describe, expect, it } from "vitest";
import { decimal, parseMoney } from "@/lib/format";

describe("parseMoney", () => {
  it("entende o jeito brasileiro e o com ponto", () => {
    expect(parseMoney("20,50")).toBe(20.5);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("20.5")).toBe(20.5);
    expect(parseMoney("20")).toBe(20);
  });

  it("rejeita vazio, negativo e texto", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-3")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("o valor exibido volta igual ao ser salvo de novo", () => {
    for (const n of [20.5, 1234.56, 0.1, 99]) expect(parseMoney(decimal(n))).toBe(n);
  });
});
