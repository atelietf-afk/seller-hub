import { describe, expect, it } from "vitest";
import { answerProblems, waitingSeverity } from "@/lib/analytics/answers";

const codes = (t: string) => answerProblems(t).map((p) => p.code);

describe("answerProblems", () => {
  it("aceita resposta normal, inclusive com números de produto", () => {
    expect(codes("Olá! Sim, funciona com Android e iPhone. Bateria de 30 horas, Bluetooth 5.3. Enviamos em até 24h. Abraços!")).toEqual([]);
    expect(codes("O modelo é o X200, voltagem 110/220V, medidas 20 x 15 x 8 cm.")).toEqual([]);
  });

  it("bloqueia telefone, e-mail, link e redes sociais", () => {
    expect(codes("Me chama no (11) 98765-4321")).toContain("phone");
    expect(codes("chama no 11987654321")).toContain("phone");
    expect(codes("manda para loja@exemplo.com")).toContain("email");
    expect(codes("veja em www.minhaloja.com.br")).toContain("link");
    expect(codes("https://bit.ly/xyz")).toContain("link");
    expect(codes("chama no whatsapp")).toContain("social");
    expect(codes("segue a gente @lojax")).toContain("social");
  });

  it("vazio e tamanho máximo", () => {
    expect(codes("   ")).toEqual(["empty"]);
    expect(codes("a".repeat(2001))).toContain("too_long");
  });
});

describe("waitingSeverity", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("marca atraso depois de 1h e crítico depois de 12h", () => {
    expect(waitingSeverity("2026-10-27T11:30:00Z", now)).toBe("info");
    expect(waitingSeverity("2026-10-27T10:00:00Z", now)).toBe("warning");
    expect(waitingSeverity("2026-10-26T20:00:00Z", now)).toBe("critical");
  });
});
