import { ML_API } from "./api";
import type { MlTokenResponse } from "./types";

// Autorização é feita no domínio do país; a troca de tokens, na API global.
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";

export function authorizationUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(body: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<MlTokenResponse> {
  const res = await fetchFn(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao obter token do Mercado Livre (${res.status}): ${await res.text()}`);
  return (await res.json()) as MlTokenResponse;
}

export function exchangeCode(
  opts: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetchFn?: typeof fetch,
) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    },
    fetchFn,
  );
}

export function refreshTokens(opts: { clientId: string; clientSecret: string; refreshToken: string }, fetchFn?: typeof fetch) {
  return tokenRequest(
    {
      grant_type: "refresh_token",
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
    },
    fetchFn,
  );
}
