import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPushSignature } from "@/lib/shopee/push";

describe("avisos da Shopee: assinatura", () => {
  const url = "https://sellerhub.idealmidiadigital.com.br/api/shopee/push";
  const body = '{"shop_id":123,"code":10}';
  const key = "chave-de-teste";
  const sign = (u: string, b: string, k: string) => createHmac("sha256", k).update(`${u}|${b}`).digest("hex");

  it("aceita a assinatura correta", () => {
    expect(verifyPushSignature(url, body, key, sign(url, body, key))).toBe(true);
  });

  it("recusa corpo alterado, outra chave, outro endereço ou sem cabeçalho", () => {
    const good = sign(url, body, key);
    expect(verifyPushSignature(url, '{"shop_id":999,"code":10}', key, good)).toBe(false);
    expect(verifyPushSignature(url, body, "outra", good)).toBe(false);
    expect(verifyPushSignature("https://outro.exemplo/push", body, key, good)).toBe(false);
    expect(verifyPushSignature(url, body, key, null)).toBe(false);
  });
});
