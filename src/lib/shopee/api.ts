import { shopeeSign } from "./sign";

// Cliente fino da Open API v2 da Shopee. Recebe uma função que devolve um access_token
// válido, para a renovação ficar num lugar só (tokens.ts).

export class ShopeeApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public code: string,
    detail: string,
  ) {
    super(`Shopee ${status} ${code} em ${path}: ${detail.slice(0, 300)}`);
  }
}

export interface ShopeeAppConfig {
  host: string;
  partnerId: number;
  partnerKey: string;
}

type Params = Record<string, string | number | boolean | (string | number)[] | undefined>;

const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

export class ShopeeApi {
  constructor(
    private cfg: ShopeeAppConfig,
    private shopId: number,
    private getToken: () => Promise<string>,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async url(path: string, params: Params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const accessToken = await this.getToken();
    const q = new URLSearchParams({
      partner_id: String(this.cfg.partnerId),
      timestamp: String(timestamp),
      access_token: accessToken,
      shop_id: String(this.shopId),
      sign: shopeeSign(this.cfg.partnerKey, { partnerId: this.cfg.partnerId, path, timestamp, accessToken, shopId: this.shopId }),
    });
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      q.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    return `${this.cfg.host}${path}?${q}`;
  }

  async get<T>(path: string, params: Params = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(await this.url(path, params), { headers: { Accept: "application/json" }, cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string; response?: T } | null;
      // Limite de chamadas e falhas do servidor: tenta de novo (até 3 vezes).
      if ((res.status === 429 || res.status >= 500 || body?.error === "error_busy") && attempt < 3) {
        await new Promise((r) => setTimeout(r, retryDelay(attempt)));
        continue;
      }
      if (!res.ok || (body?.error && body.error !== "")) {
        throw new ShopeeApiError(res.status, path, body?.error ?? "http", body?.message ?? "");
      }
      return (body?.response ?? ({} as T)) as T;
    }
  }
}
