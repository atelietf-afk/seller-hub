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

export type ConnectProblem = "autorizacao-negada" | "estado-invalido" | "sem-acesso-offline";

/** Confere a volta da autorização antes de trocar o código por tokens. */
export function callbackProblem(params: URLSearchParams, expectedState: string | undefined): ConnectProblem | null {
  if (params.get("error")) return "autorizacao-negada";
  if (!params.get("code") || !expectedState || params.get("state") !== expectedState) return "estado-invalido";
  return null;
}

/** Sem refresh_token o acesso expira em 6 horas: o app no ML precisa do escopo offline_access. */
export function hasRefreshToken(t: MlTokenResponse): t is MlTokenResponse & { refresh_token: string } {
  return typeof t.refresh_token === "string" && t.refresh_token.length > 0;
}
