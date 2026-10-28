import { describe, expect, it } from "vitest";
import { can, isMemberRole, normalizeEmail, validEmail } from "@/lib/analytics/team";
import { safeNext } from "@/lib/next-path";

describe("perfis", () => {
  it("cada perfil pode o seu nível e os de baixo", () => {
    expect(can("dono", "dono")).toBe(true);
    expect(can("gerente", "dono")).toBe(false);
    expect(can("gerente", "gerenciar")).toBe(true);
    expect(can("operador", "gerenciar")).toBe(false);
    expect(can("operador", "operar")).toBe(true);
    expect(can("leitura", "operar")).toBe(false);
  });
  it("só aceita perfis de membro (dono não se convida)", () => {
    expect(isMemberRole("gerente")).toBe(true);
    expect(isMemberRole("dono")).toBe(false);
    expect(isMemberRole("admin")).toBe(false);
  });
  it("e-mail", () => {
    expect(normalizeEmail("  Ana@Loja.COM ")).toBe("ana@loja.com");
    expect(validEmail("ana@loja.com")).toBe(true);
    expect(validEmail("ana@loja")).toBe(false);
    expect(validEmail("ana loja@x.com")).toBe(false);
  });
});


describe("safeNext", () => {
  it("só volta para a página de convite", () => {
    expect(safeNext("/convite/abcDEF_123-xyz")).toBe("/convite/abcDEF_123-xyz");
    expect(safeNext("https://malicioso.com")).toBeNull();
    expect(safeNext("//malicioso.com")).toBeNull();
    expect(safeNext("/convite/../configuracoes")).toBeNull();
    expect(safeNext("/dashboard")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
