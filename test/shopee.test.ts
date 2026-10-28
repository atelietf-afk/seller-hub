import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ShopeeApi, ShopeeApiError } from "@/lib/shopee/api";
import { refreshShopeeToken, tokenFromCode } from "@/lib/shopee/oauth";
import { shopeeAuthUrl, shopeeSign } from "@/lib/shopee/sign";

const cfg = { host: "https://partner.shopeemobile.com", partnerId: 2001887, partnerKey: "chave" };
const hmac = (text: string) => createHmac("sha256", "chave").update(text).digest("hex");

describe("assinatura da Shopee", () => {
  it("assina partner_id + caminho + timestamp (+ token + loja nas chamadas da loja)", () => {
    expect(shopeeSign("chave", { partnerId: 2001887, path: "/api/v2/shop/auth_partner", timestamp: 1700000000 })).toBe(
      hmac("2001887/api/v2/shop/auth_partner1700000000"),
    );
    expect(
      shopeeSign("chave", { partnerId: 2001887, path: "/api/v2/order/get_order_list", timestamp: 1700000000, accessToken: "tok", shopId: 55 }),
    ).toBe(hmac("2001887/api/v2/order/get_order_list1700000000tok55"));
  });

  it("monta o link de autorização da loja", () => {
    const url = new URL(shopeeAuthUrl({ ...cfg, redirect: "https://sellerhub.example/api/shopee/callback?state=abc", timestamp: 1700000000 }));
    expect(url.origin + url.pathname).toBe("https://partner.shopeemobile.com/api/v2/shop/auth_partner");
    expect(url.searchParams.get("partner_id")).toBe("2001887");
    expect(url.searchParams.get("sign")).toBe(hmac("2001887/api/v2/shop/auth_partner1700000000"));
    expect(url.searchParams.get("redirect")).toBe("https://sellerhub.example/api/shopee/callback?state=abc");
  });
});

describe("cliente da API", () => {
  it("manda os parâmetros comuns, assina e devolve o response", async () => {
    const calls: string[] = [];
    const api = new ShopeeApi(cfg, 55, async () => "tok", (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ error: "", message: "", response: { item: [1] } }));
    }) as unknown as typeof fetch);
    expect(await api.get("/api/v2/product/get_item_list", { offset: 0, item_status: ["NORMAL", "UNLIST"] })).toEqual({ item: [1] });
    const u = new URL(calls[0]);
    expect(u.searchParams.get("shop_id")).toBe("55");
    expect(u.searchParams.get("access_token")).toBe("tok");
    expect(u.searchParams.get("item_status")).toBe("NORMAL,UNLIST");
    const ts = u.searchParams.get("timestamp");
    expect(u.searchParams.get("sign")).toBe(hmac(`2001887/api/v2/product/get_item_list${ts}tok55`));
  });

  it("transforma erro da Shopee em exceção (mesmo com HTTP 200)", async () => {
    const api = new ShopeeApi(cfg, 55, async () => "tok", (async () =>
      new Response(JSON.stringify({ error: "error_auth", message: "Invalid access_token." }), { status: 200 })) as unknown as typeof fetch);
    await expect(api.get("/api/v2/shop/get_shop_info")).rejects.toMatchObject({ code: "error_auth" });
    await expect(api.get("/api/v2/shop/get_shop_info")).rejects.toBeInstanceOf(ShopeeApiError);
  });
});


describe("tokens da loja", () => {
  it("troca o código por tokens com POST assinado sem token e com partner_id no corpo", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expire_in: 14400, error: "" }));
    }) as unknown as typeof fetch;
    expect(await tokenFromCode(cfg, "codigo", 55, fetchFn)).toMatchObject({ access_token: "a", refresh_token: "r" });
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe("/api/v2/auth/token/get");
    expect(u.searchParams.get("sign")).toBe(hmac(`2001887/api/v2/auth/token/get${u.searchParams.get("timestamp")}`));
    expect(calls[0].body).toEqual({ code: "codigo", shop_id: 55, partner_id: 2001887 });

    await refreshShopeeToken(cfg, "r", 55, fetchFn);
    expect(new URL(calls[1].url).pathname).toBe("/api/v2/auth/access_token/get");
    expect(calls[1].body).toEqual({ refresh_token: "r", shop_id: 55, partner_id: 2001887 });
  });

  it("recusa resposta de erro ou sem refresh_token", async () => {
    const reply = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    await expect(tokenFromCode(cfg, "x", 55, reply({ error: "error_param", message: "Invalid code" }))).rejects.toThrow("Invalid code");
    await expect(tokenFromCode(cfg, "x", 55, reply({ access_token: "a", expire_in: 1 }))).rejects.toThrow();
  });
});
