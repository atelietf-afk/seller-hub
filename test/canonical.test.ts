import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "@/lib/canonical";

const base = {
  path: "/publicidade",
  search: "?aba=itens",
  vercelEnv: "production",
  canonicalUrl: "https://sellerhub.idealmidiadigital.com.br",
};

describe("canonicalRedirect", () => {
  it("manda o domínio vercel.app de produção para o domínio próprio", () => {
    expect(canonicalRedirect({ ...base, host: "seller-hub-five.vercel.app" })).toBe(
      "https://sellerhub.idealmidiadigital.com.br/publicidade?aba=itens",
    );
  });

  it("não mexe no domínio próprio", () => {
    expect(canonicalRedirect({ ...base, host: "sellerhub.idealmidiadigital.com.br" })).toBeNull();
  });

  it("deixa as rotas /api em paz (cron, webhooks, OAuth)", () => {
    for (const path of ["/api/cron/sync", "/api/ml/notifications", "/api/ml/callback", "/api"]) {
      expect(canonicalRedirect({ ...base, path, host: "seller-hub-five.vercel.app" })).toBeNull();
    }
    expect(canonicalRedirect({ ...base, path: "/apiario", host: "seller-hub-five.vercel.app" })).not.toBeNull();
  });

  it("não redireciona fora de produção nem sem URL válida", () => {
    const host = "seller-abc-toque-final2.vercel.app";
    expect(canonicalRedirect({ ...base, host, vercelEnv: "preview" })).toBeNull();
    expect(canonicalRedirect({ ...base, host, vercelEnv: undefined })).toBeNull();
    expect(canonicalRedirect({ ...base, host, canonicalUrl: undefined })).toBeNull();
    expect(canonicalRedirect({ ...base, host, canonicalUrl: "lixo" })).toBeNull();
    expect(canonicalRedirect({ ...base, host: null })).toBeNull();
  });

  it("não cria laço se a URL oficial for o próprio vercel.app", () => {
    expect(
      canonicalRedirect({ ...base, host: "seller-hub-five.vercel.app", canonicalUrl: "https://seller-hub-five.vercel.app" }),
    ).toBeNull();
  });
});
