import { shopeeSign } from "./sign";
import type { ShopeeAppConfig } from "./api";

// Troca e renovação de tokens da loja. Nestas chamadas a assinatura não leva token nem loja.

export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number; // segundos (hoje, 4 horas)
  error?: string;
  message?: string;
}

async function tokenRequest(cfg: ShopeeAppConfig, path: string, body: Record<string, unknown>, fetchFn: typeof fetch) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = shopeeSign(cfg.partnerKey, { partnerId: cfg.partnerId, path, timestamp });
  const q = new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(timestamp), sign });
  const res = await fetchFn(`${cfg.host}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...body, partner_id: cfg.partnerId }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as ShopeeTokenResponse | null;
  if (!res.ok || !json || json.error || !json.access_token || !json.refresh_token) {
    throw new Error(`Shopee recusou o token (${res.status} ${json?.error ?? ""}): ${json?.message ?? ""}`.trim());
  }
  return json;
}

/** Código de autorização (vale 10 minutos, uma vez) → tokens da loja. */
export function tokenFromCode(cfg: ShopeeAppConfig, code: string, shopId: number, fetchFn: typeof fetch = fetch) {
  return tokenRequest(cfg, "/api/v2/auth/token/get", { code, shop_id: shopId }, fetchFn);
}

/** Renova o access_token (4 h) com o refresh_token (30 dias). A Shopee devolve um refresh_token novo. */
export function refreshShopeeToken(cfg: ShopeeAppConfig, refreshToken: string, shopId: number, fetchFn: typeof fetch = fetch) {
  return tokenRequest(cfg, "/api/v2/auth/access_token/get", { refresh_token: refreshToken, shop_id: shopId }, fetchFn);
}
