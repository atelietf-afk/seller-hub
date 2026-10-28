import type { SpApi } from "./api";
import type { AmazonOrder, FinancialEvents } from "./map";

// Chamadas da SP-API usadas pelo Seller Hub.

const REPORTS = "/reports/2021-06-30";

export interface ReportStatus {
  reportId: string;
  processingStatus: "IN_QUEUE" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "FATAL";
  reportDocumentId?: string;
}

export class AmazonSeller {
  constructor(
    private api: SpApi,
    private marketplaceId: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  /** Uma página de pedidos (API de pedidos 2026-01-01). */
  ordersPage(filter: { createdAfter?: string; createdBefore?: string; lastUpdatedAfter?: string }, paginationToken?: string) {
    return this.api.get<{ orders?: AmazonOrder[]; pagination?: { nextToken?: string } }>("/orders/2026-01-01/orders", {
      marketplaceIds: this.marketplaceId,
      ...filter,
      includedData: ["PROCEEDS", "FULFILLMENT"],
      maxResultsPerPage: 100,
      paginationToken,
    });
  }

  async financialEvents(orderId: string): Promise<FinancialEvents> {
    const r = await this.api.get<{ payload?: { FinancialEvents?: FinancialEvents } }>(
      `/finances/v0/orders/${encodeURIComponent(orderId)}/financialEvents`,
    );
    return r.payload?.FinancialEvents ?? {};
  }

  async storeName(): Promise<string | null> {
    const r = await this.api.get<{ payload?: { marketplace?: { id?: string }; storeName?: string }[] }>(
      "/sellers/v1/marketplaceParticipations",
    );
    return r.payload?.find((p) => p.marketplace?.id === this.marketplaceId)?.storeName ?? r.payload?.[0]?.storeName ?? null;
  }

  async requestListingsReport(): Promise<string> {
    const r = await this.api.post<{ reportId: string }>(`${REPORTS}/reports`, {
      reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
      marketplaceIds: [this.marketplaceId],
    });
    return r.reportId;
  }

  report(reportId: string) {
    return this.api.get<ReportStatus>(`${REPORTS}/reports/${reportId}`);
  }

  /** Baixa o documento do relatório (link temporário, às vezes compactado). */
  async reportText(documentId: string): Promise<string> {
    const doc = await this.api.get<{ url: string; compressionAlgorithm?: string }>(`${REPORTS}/documents/${documentId}`);
    const res = await this.fetchFn(doc.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Download do relatório da Amazon falhou (${res.status})`);
    let bytes = new Uint8Array(await res.arrayBuffer());
    if (doc.compressionAlgorithm === "GZIP") {
      const { gunzipSync } = await import("node:zlib");
      bytes = new Uint8Array(gunzipSync(bytes));
    }
    const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}
