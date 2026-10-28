// Cliente fino da Selling Partner API. Desde 2023 basta o token do Login with Amazon no
// cabeçalho x-amz-access-token (sem assinatura AWS).

export class SpApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    detail: string,
  ) {
    super(`Amazon ${status} em ${path}: ${detail.slice(0, 300)}`);
  }
}

type Params = Record<string, string | number | string[] | undefined>;

const retryDelay = (attempt: number, retryAfter: string | null) => {
  const s = retryAfter != null ? Number(retryAfter) : NaN;
  return Math.min(Number.isFinite(s) && s >= 0 ? s * 1000 : 2000 * 2 ** attempt, 20_000);
};

export class SpApi {
  constructor(
    private host: string,
    private getToken: () => Promise<string>,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async request<T>(method: "GET" | "POST", path: string, params: Params = {}, body?: unknown): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, Array.isArray(v) ? v.join(",") : String(v));
    const url = `${this.host}${path}${q.size ? `?${q}` : ""}`;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(url, {
        method,
        headers: {
          "x-amz-access-token": await this.getToken(),
          Accept: "application/json",
          "User-Agent": "SellerHub/1.0 (Language=TypeScript)",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      // Limite de chamadas (muito baixo em pedidos) e falhas do servidor: espera e tenta de novo.
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, retryDelay(attempt, res.headers.get("retry-after"))));
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new SpApiError(res.status, path, text);
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  get<T>(path: string, params?: Params) {
    return this.request<T>("GET", path, params);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, {}, body);
  }
}
