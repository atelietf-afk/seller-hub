import { describe, expect, it, vi } from "vitest";
import { MlAdsApi } from "@/lib/ml/ads-api";
import { MlApi, MlApiError } from "@/lib/ml/api";
import { authorizationUrl, callbackProblem, hasRefreshToken, refreshTokens } from "@/lib/ml/oauth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("MlApi", () => {
  it("envia o token e busca anúncios em lotes de 20", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const ids = new URL(String(url)).searchParams.get("ids")!.split(",");
      return json(ids.map((id) => ({ code: 200, body: { id } })));
    });
    const api = new MlApi(async () => "tok", fetchFn as typeof fetch);
    const ids = Array.from({ length: 45 }, (_, i) => `MLB${i}`);
    const items = await api.items(ids);
    expect(items).toHaveLength(45);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("pagina os pedidos até o total", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      return json({ results: Array.from({ length: calls < 3 ? 50 : 10 }, (_, i) => ({ id: calls * 100 + i })), paging: { total: 110 } });
    });
    const orders = await new MlApi(async () => "t", fetchFn as typeof fetch).ordersSince(1, new Date());
    expect(orders).toHaveLength(110);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("tenta de novo em 429 e falha em 404", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("calma", { status: 429 }))
      .mockResolvedValueOnce(json({ id: 1, nickname: "loja" }))
      .mockResolvedValueOnce(new Response("não existe", { status: 404 }));
    const api = new MlApi(async () => "t", fetchFn as typeof fetch);
    expect((await api.me()).nickname).toBe("loja");
    await expect(api.item("MLB9")).rejects.toBeInstanceOf(MlApiError);
  });
});

describe("oauth", () => {
  it("monta a URL de autorização", () => {
    const u = new URL(authorizationUrl({ clientId: "123", redirectUri: "https://x.app/cb", state: "abc" }));
    expect(u.host).toBe("auth.mercadolivre.com.br");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: "code",
      client_id: "123",
      redirect_uri: "https://x.app/cb",
      state: "abc",
    });
  });

  it("renova o token com refresh_token", async () => {
    const fetchFn = vi.fn(async () => json({ access_token: "a", refresh_token: "r2", expires_in: 21600, user_id: 1 }));
    const t = await refreshTokens({ clientId: "1", clientSecret: "s", refreshToken: "r1" }, fetchFn as typeof fetch);
    expect(t.refresh_token).toBe("r2");
    const body = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r1");
  });
});

describe("volta da autorização", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("aceita código com o state certo", () => {
    expect(callbackProblem(q("code=TG-1&state=abc"), "abc")).toBeNull();
  });

  it("recusa state diferente, ausente ou sem cookie", () => {
    expect(callbackProblem(q("code=TG-1&state=xyz"), "abc")).toBe("estado-invalido");
    expect(callbackProblem(q("code=TG-1"), "abc")).toBe("estado-invalido");
    expect(callbackProblem(q("code=TG-1&state=abc"), undefined)).toBe("estado-invalido");
  });

  it("identifica autorização cancelada no ML", () => {
    expect(callbackProblem(q("error=access_denied&state=abc"), "abc")).toBe("autorizacao-negada");
  });

  it("exige refresh_token (escopo offline_access)", () => {
    const base = { access_token: "a", expires_in: 21600, user_id: 1 };
    expect(hasRefreshToken(base)).toBe(false);
    expect(hasRefreshToken({ ...base, refresh_token: "" })).toBe(false);
    expect(hasRefreshToken({ ...base, refresh_token: "TG-r" })).toBe(true);
  });
});

describe("MlAdsApi", () => {
  it("usa o caminho antigo de campanhas quando o novo não existe", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/marketplace/advertising/")) return new Response("not found", { status: 404 });
      return json({ results: [{ id: 5, name: "Campanha A", status: "active", acos_target: 12, metrics: { cost: 10, total_amount: 100 } }] });
    });
    const ads = new MlAdsApi(new MlApi(async () => "t", fetchFn as typeof fetch));
    const [c] = await ads.campaigns({ advertiserId: 9, siteId: "MLB" }, new Date("2026-10-01"), new Date("2026-10-30"));
    expect(c).toMatchObject({ id: 5, name: "Campanha A", cost: 10, revenue: 100 });
    expect(c.acosTarget).toBeCloseTo(0.12);
    const calls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toContain("/marketplace/advertising/MLB/advertisers/9/product_ads/campaigns/search?");
    expect(calls[1]).toContain("/advertising/advertisers/9/product_ads/campaigns?");
    expect(calls[1]).toContain("date_from=2026-10-01");
  });

  it("devolve null por anúncio quando a API não oferece esse detalhe", async () => {
    const fetchFn = vi.fn(async () => new Response("gone", { status: 404 }));
    const ads = new MlAdsApi(new MlApi(async () => "t", fetchFn as typeof fetch));
    expect(await ads.items({ advertiserId: 9, siteId: "MLB" }, new Date(), new Date())).toBeNull();
  });

  it("propaga erros que não são de caminho (ex.: 401)", async () => {
    const fetchFn = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const ads = new MlAdsApi(new MlApi(async () => "t", fetchFn as typeof fetch));
    await expect(ads.campaigns({ advertiserId: 9, siteId: "MLB" }, new Date(), new Date())).rejects.toBeInstanceOf(MlApiError);
  });

  it("identifica quem não usa Product Ads", async () => {
    const fetchFn = vi.fn(async () => json({ advertisers: [] }));
    const ads = new MlAdsApi(new MlApi(async () => "t", fetchFn as typeof fetch));
    expect(await ads.advertiser()).toBeNull();
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["Api-Version"]).toBe("1");
  });
});
