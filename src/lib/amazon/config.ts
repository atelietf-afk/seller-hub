import "server-only";

// App da Amazon (Seller Central → Apps e serviços → Desenvolver apps).
// AMAZON_APP_DRAFT=true enquanto o app não foi publicado (a autorização pede version=beta).

export const AMAZON_BR_MARKETPLACE = "A2Q3Y263D00KWC";

export function amazonConfigured() {
  return !!(process.env.AMAZON_APP_ID && process.env.AMAZON_LWA_CLIENT_ID && process.env.AMAZON_LWA_CLIENT_SECRET);
}

export function amazonConfig() {
  const { AMAZON_APP_ID, AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET } = process.env;
  if (!AMAZON_APP_ID || !AMAZON_LWA_CLIENT_ID || !AMAZON_LWA_CLIENT_SECRET) {
    throw new Error("Amazon não configurada: AMAZON_APP_ID, AMAZON_LWA_CLIENT_ID e AMAZON_LWA_CLIENT_SECRET");
  }
  return {
    appId: AMAZON_APP_ID,
    clientId: AMAZON_LWA_CLIENT_ID,
    clientSecret: AMAZON_LWA_CLIENT_SECRET,
    draft: process.env.AMAZON_APP_DRAFT === "true",
    sellerCentral: "https://sellercentral.amazon.com.br",
    apiHost: (process.env.AMAZON_SP_API_URL || "https://sellingpartnerapi-na.amazon.com").replace(/\/$/, ""),
    marketplaceId: AMAZON_BR_MARKETPLACE,
  };
}
