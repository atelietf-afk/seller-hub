import type { MlItem, MlOrder, MlQuestion, MlShipmentCosts, MlUser, MlVisitsWindow } from "./types";

export const ML_API = "https://api.mercadolibre.com";

export class MlApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    body: string,
  ) {
    super(`Mercado Livre ${status} em ${path}: ${body.slice(0, 300)}`);
  }
}

type Fetch = typeof fetch;

// Cliente fino da API. Recebe uma função que devolve um access token válido,
// para que a renovação do token fique em um só lugar (tokens.ts).
export class MlApi {
  constructor(
    private getToken: () => Promise<string>,
    private fetchFn: Fetch = fetch,
  ) {}

  async get<T>(path: string, init: { headers?: Record<string, string> } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(`${ML_API}${path}`, {
        headers: { Authorization: `Bearer ${await this.getToken()}`, Accept: "application/json", ...init.headers },
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      // 429 e 5xx: tenta de novo com espera crescente (até 3 vezes).
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new MlApiError(res.status, path, await res.text());
    }
  }

  me() {
    return this.get<MlUser>("/users/me");
  }

  user(id: number) {
    return this.get<MlUser>(`/users/${id}`);
  }

  /** Todos os IDs de anúncios do vendedor (usa scan para passar de 1000). */
  async itemIds(userId: number): Promise<string[]> {
    const ids: string[] = [];
    let scrollId: string | undefined;
    for (;;) {
      const q = new URLSearchParams({ search_type: "scan", limit: "100" });
      if (scrollId) q.set("scroll_id", scrollId);
      const page = await this.get<{ results: string[]; scroll_id?: string }>(`/users/${userId}/items/search?${q}`);
      if (!page.results.length) break;
      ids.push(...page.results);
      scrollId = page.scroll_id;
      if (!scrollId) break;
    }
    return ids;
  }

  /** Busca anúncios em lotes de 20 (limite do multiget). */
  async items(ids: string[]): Promise<MlItem[]> {
    const out: MlItem[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20).join(",");
      const res = await this.get<{ code: number; body: MlItem }[]>(`/items?ids=${chunk}`);
      out.push(...res.filter((r) => r.code === 200).map((r) => r.body));
    }
    return out;
  }

  item(id: string) {
    return this.get<MlItem>(`/items/${id}`);
  }

  /** Pedidos criados a partir de uma data, do mais novo para o mais antigo. */
  async ordersSince(sellerId: number, from: Date): Promise<MlOrder[]> {
    const out: MlOrder[] = [];
    for (let offset = 0; ; offset += 50) {
      const q = new URLSearchParams({
        seller: String(sellerId),
        "order.date_created.from": from.toISOString(),
        sort: "date_desc",
        limit: "50",
        offset: String(offset),
      });
      const page = await this.get<{ results: MlOrder[]; paging: { total: number } }>(`/orders/search?${q}`);
      out.push(...page.results);
      if (offset + 50 >= page.paging.total || !page.results.length) break;
    }
    return out;
  }

  order(id: number | string) {
    return this.get<MlOrder>(`/orders/${id}`);
  }

  shipmentCosts(shipmentId: number) {
    return this.get<MlShipmentCosts>(`/shipments/${shipmentId}/costs`, { headers: { "x-format-new": "true" } });
  }

  question(id: number | string) {
    return this.get<MlQuestion>(`/questions/${id}?api_version=4`);
  }

  async unansweredQuestions(sellerId: number): Promise<MlQuestion[]> {
    const q = new URLSearchParams({ seller_id: String(sellerId), status: "UNANSWERED", api_version: "4", limit: "50" });
    return (await this.get<{ questions: MlQuestion[] }>(`/questions/search?${q}`)).questions;
  }

  visits(itemId: string, lastDays = 30) {
    return this.get<MlVisitsWindow>(`/items/${itemId}/visits/time_window?last=${lastDays}&unit=day`);
  }
}
