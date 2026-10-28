// Login with Amazon: autorização do vendedor e tokens da SP-API (o de acesso vale 1 hora;
// o de renovação não expira enquanto a autorização valer).

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

/** Página da Central do Vendedor em que o vendedor autoriza o app. */
export function amazonConsentUrl(cfg: { sellerCentral: string; appId: string; draft: boolean }, state: string, redirectUri: string) {
  const q = new URLSearchParams({ application_id: cfg.appId, state, redirect_uri: redirectUri });
  if (cfg.draft) q.set("version", "beta");
  return `${cfg.sellerCentral}/apps/authorize/consent?${q}`;
}

export interface LwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function lwa(body: Record<string, string>, fetchFn: typeof fetch): Promise<LwaTokenResponse> {
  const res = await fetchFn(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as (LwaTokenResponse & { error?: string; error_description?: string }) | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(`Amazon recusou o token (${res.status} ${json?.error ?? ""}): ${json?.error_description ?? ""}`.trim());
  }
  return json;
}

export function tokenFromCode(
  cfg: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
  fetchFn: typeof fetch = fetch,
) {
  return lwa(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret },
    fetchFn,
  );
}

export function refreshAmazonToken(cfg: { clientId: string; clientSecret: string }, refreshToken: string, fetchFn: typeof fetch = fetch) {
  return lwa(
    { grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret },
    fetchFn,
  );
}
