import { createHmac } from "node:crypto";

// Assinatura da Open API v2 da Shopee: HMAC-SHA256 (hex) com a partner_key sobre
// partner_id + caminho + timestamp, mais access_token + shop_id nas chamadas da loja.

export function shopeeSign(
  partnerKey: string,
  base: { partnerId: number; path: string; timestamp: number; accessToken?: string; shopId?: number },
): string {
  const text = `${base.partnerId}${base.path}${base.timestamp}${base.accessToken ?? ""}${base.shopId ?? ""}`;
  return createHmac("sha256", partnerKey).update(text).digest("hex");
}

/** Link para o vendedor autorizar a loja. O timestamp vale 5 minutos. */
export function shopeeAuthUrl(cfg: { host: string; partnerId: number; partnerKey: string; redirect: string; timestamp: number }): string {
  const path = "/api/v2/shop/auth_partner";
  const sign = shopeeSign(cfg.partnerKey, { partnerId: cfg.partnerId, path, timestamp: cfg.timestamp });
  const q = new URLSearchParams({ partner_id: String(cfg.partnerId), timestamp: String(cfg.timestamp), sign, redirect: cfg.redirect });
  return `${cfg.host}${path}?${q}`;
}
