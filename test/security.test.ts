import { describe, expect, it } from "vitest";
import { isBackupCode, passwordExpired, passwordExpiresAt, passwordProblem, pendingSecurityStep } from "@/lib/analytics/security";

describe("regra de senha", () => {
  it("exige 12 caracteres, letra, número e caractere especial", () => {
    expect(passwordProblem("Curta1!")).toMatch(/12 caracteres/);
    expect(passwordProblem("123456789012!")).toMatch(/letra/);
    expect(passwordProblem("SemNumeroAqui!")).toMatch(/número/);
    expect(passwordProblem("SemEspecial123")).toMatch(/especial/);
    expect(passwordProblem("Sem espaco 123")).toMatch(/especial/); // espaço não conta
    expect(passwordProblem("Ateliê-Toque-2026")).toBeNull();
    expect(passwordProblem("caneca#personalizada9")).toBeNull();
  });

  it("vence em 365 dias e senha antiga (sem data) precisa ser trocada", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(passwordExpired(null, now)).toBe(true);
    expect(passwordExpired("2025-10-29T12:00:00Z", now)).toBe(false);
    expect(passwordExpired("2025-10-27T12:00:00Z", now)).toBe(true);
    expect(passwordExpiresAt("2026-01-01T00:00:00Z").toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("passos obrigatórios", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("primeiro a senha, depois a verificação em duas etapas", () => {
    expect(pendingSecurityStep({ passwordChangedAt: null, twoFactorEnabled: false }, now)).toBe("senha");
    expect(pendingSecurityStep({ passwordChangedAt: null, twoFactorEnabled: true }, now)).toBe("senha");
    expect(pendingSecurityStep({ passwordChangedAt: "2026-10-01", twoFactorEnabled: false }, now)).toBe("duas-etapas");
    expect(pendingSecurityStep({ passwordChangedAt: "2026-10-01", twoFactorEnabled: true }, now)).toBeNull();
  });

  it("separa código do aplicativo de código de recuperação", () => {
    expect(isBackupCode("123 456")).toBe(false);
    expect(isBackupCode("AbCd3-eFgH5")).toBe(true);
  });
});
