import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("criptografa e descriptografa", () => {
    const sealed = encrypt("APP_USR-123", key);
    expect(sealed).not.toContain("APP_USR");
    expect(decrypt(sealed, key)).toBe("APP_USR-123");
  });

  it("rejeita conteúdo alterado ou chave errada", () => {
    const sealed = encrypt("segredo", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("exige chave de 32 bytes", () => {
    expect(() => encrypt("x", Buffer.from("curta").toString("base64"))).toThrow(/32 bytes/);
  });
});
