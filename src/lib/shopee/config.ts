import "server-only";

// Credenciais do app na Shopee Open Platform (Console → App List).
// SHOPEE_API_URL: host da API mostrado no Console (produção ou sandbox).

export function shopeeConfigured() {
  return !!(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);
}

export function shopeeConfig() {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
  if (!Number.isFinite(partnerId) || !partnerKey) throw new Error("Shopee não configurada: SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY");
  return { partnerId, partnerKey, host: (process.env.SHOPEE_API_URL || "https://partner.shopeemobile.com").replace(/\/$/, "") };
}
