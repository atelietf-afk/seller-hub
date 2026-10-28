import "server-only";
import { one, query } from "@/lib/db";
import { brl } from "@/lib/format";
import { pushEvents, upsertItems } from "@/lib/ml/store";
import type { MlItem } from "@/lib/ml/types";
import { saveOrders } from "@/lib/orders-store";
import { amazonConfig } from "./config";
import { feesBySku, mapAmazonOrder, parseListingsReport, type AmazonOrder, type MappedAmazonOrder } from "./map";
import { AmazonSeller } from "./seller";
import { amazonApiFor } from "./tokens";

const DAY = 86_400_000;
/** Pedidos atualizados nos últimos dias são relidos a cada sincronização (pega cancelamentos). */
const RECENT_DAYS = 15;
/** Histórico buscado aos poucos, como nos outros marketplaces. */
const HISTORY_DAYS = 120;
const HISTORY_STEP_DAYS = 30;
/** A API de pedidos aceita pouquíssimas chamadas: limita as páginas por sincronização. */
const MAX_PAGES = 15;
/** Extratos (taxas reais) por sincronização: uma chamada por pedido. */
const MAX_FEES = 40;
/** Espera curta pelo relatório de anúncios; se não ficar pronto, é lido na próxima sincronização. */
const REPORT_WAIT_MS = 45_000;
const REPORT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface AmazonSyncResult {
  items: number | null;
  orders: number;
  newOrders: number;
  fees: number;
  historySince: string;
  seconds: number;
}

interface PendingReport {
  reportId: string;
  requestedAt: string;
}

/** Lê as páginas enquanto houver orçamento; `complete` diz se chegou ao fim. */
async function collectOrders(seller: AmazonSeller, filter: Parameters<AmazonSeller["ordersPage"]>[0], budget: { pages: number }) {
  const orders: AmazonOrder[] = [];
  let token: string | undefined;
  do {
    if (budget.pages <= 0) return { orders, complete: false };
    budget.pages--;
    const page = await seller.ordersPage(filter, token);
    orders.push(...(page.orders ?? []));
    token = page.pagination?.nextToken;
  } while (token);
  return { orders, complete: true };
}

/** Relatório de anúncios: pede, espera um pouco e lê; se demorar, fica para a próxima sincronização. */
async function syncListings(accountId: string, seller: AmazonSeller, pending: PendingReport | null): Promise<number | null> {
  let report = pending && Date.now() - new Date(pending.requestedAt).getTime() < REPORT_MAX_AGE_MS ? pending : null;
  if (!report) {
    report = { reportId: await seller.requestListingsReport(), requestedAt: new Date().toISOString() };
    await query("update ml_accounts set amazon_report = $2 where id = $1", [accountId, JSON.stringify(report)]);
  }
  const deadline = Date.now() + REPORT_WAIT_MS;
  for (;;) {
    const status = await seller.report(report.reportId);
    if (status.processingStatus === "DONE" && status.reportDocumentId) {
      const rows = parseListingsReport(await seller.reportText(status.reportDocumentId));
      await upsertItems(accountId, rows as unknown as MlItem[]);
      // Anúncios que sumiram do relatório foram excluídos na Amazon.
      await query("update items set status = 'closed' where account_id = $1 and not (id = any($2::text[]))", [
        accountId,
        rows.map((r) => r.id),
      ]);
      await query("update ml_accounts set amazon_report = null where id = $1", [accountId]);
      return rows.length;
    }
    if (status.processingStatus === "CANCELLED" || status.processingStatus === "FATAL") {
      await query("update ml_accounts set amazon_report = null where id = $1", [accountId]);
      return null;
    }
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

/** Sincroniza anúncios e pedidos de uma conta da Amazon. */
export async function syncAmazon(accountId: string): Promise<AmazonSyncResult> {
  const started = Date.now();
  const account = await one<{ orders_history_since: string | null; amazon_report: PendingReport | null }>(
    "select orders_history_since, amazon_report from ml_accounts where id = $1 and marketplace = 'amazon'",
    [accountId],
  );
  if (!account) throw new Error(`Conta ${accountId} não é da Amazon`);
  const cfg = amazonConfig();
  const seller = new AmazonSeller(amazonApiFor(accountId), cfg.marketplaceId);

  const items = await syncListings(accountId, seller, account.amazon_report).catch((err) => {
    console.error("Relatório de anúncios da Amazon falhou", accountId, err);
    return null;
  });

  // Pedidos: a API exige no mínimo 2 minutos de distância do agora.
  const now = new Date(Date.now() - 3 * 60_000);
  const budget = { pages: MAX_PAGES };
  const byId = new Map<string, AmazonOrder>();
  const recent = await collectOrders(seller, { lastUpdatedAfter: new Date(now.getTime() - RECENT_DAYS * DAY).toISOString() }, budget);
  for (const o of recent.orders) byId.set(o.orderId, o);
  let historySince = new Date(account.orders_history_since ?? now.getTime() - RECENT_DAYS * DAY);
  const historyLimit = new Date(now.getTime() - HISTORY_DAYS * DAY);
  if (historySince > historyLimit && budget.pages > 0) {
    const from = new Date(Math.max(historyLimit.getTime(), historySince.getTime() - HISTORY_STEP_DAYS * DAY));
    const older = await collectOrders(seller, { createdAfter: from.toISOString(), createdBefore: historySince.toISOString() }, budget);
    for (const o of older.orders) byId.set(o.orderId, o);
    // Só avança o histórico se a janela inteira coube nas páginas desta sincronização.
    if (older.complete) historySince = from;
  }

  const ids = [...byId.keys()];
  const existing = new Map(
    (
      await query<{ id: string; status: string; fees: number }>(
        `select o.id, o.status, coalesce(sum(i.sale_fee), 0)::float as fees
       from orders o left join order_items i on i.order_id = o.id where o.account_id = $1 and o.id = any($2::text[]) group by o.id`,
        [accountId, ids],
      )
    ).map((e) => [e.id, e]),
  );

  // Taxas só para pedidos pagos ainda sem taxa gravada (o extrato aparece quando o pedido é enviado).
  let fees = 0;
  const mapped: MappedAmazonOrder[] = [];
  for (const o of byId.values()) {
    const base = mapAmazonOrder(o);
    const before = existing.get(o.orderId);
    let feeMap: Map<string, number> | undefined;
    if (base.status === "paid" && !(before && before.fees > 0) && fees < MAX_FEES) {
      fees++;
      feeMap = await seller.financialEvents(o.orderId).then(feesBySku, () => undefined);
    }
    mapped.push(feeMap ? mapAmazonOrder(o, feeMap) : base);
  }
  await saveOrders(accountId, mapped);

  const fresh = mapped.filter(
    (o) => !existing.has(o.id) && o.status === "paid" && new Date(o.date_created).getTime() > Date.now() - 2 * DAY,
  );
  await pushEvents(
    accountId,
    fresh.map((o) => ({
      kind: "order" as const,
      severity: "success" as const,
      title: `Nova venda na Amazon: ${brl(o.total_amount)}`,
      body: `${o.lines[0]?.quantity ?? 1}x ${o.lines[0]?.title ?? "produto"}`,
      itemId: o.lines[0]?.item_id,
      dedupeKey: `order:${o.id}`,
    })),
  );

  const name = await seller.storeName().catch(() => null);
  const result: AmazonSyncResult = {
    items,
    orders: mapped.length,
    newOrders: mapped.filter((o) => !existing.has(o.id)).length,
    fees,
    historySince: historySince.toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
  };
  await query(
    `update ml_accounts set nickname = coalesce($2, nickname), last_synced_at = now(), orders_history_since = $3, last_sync_result = $4 where id = $1`,
    [accountId, name, historySince.toISOString(), JSON.stringify(result)],
  );
  console.info("Sincronização Amazon concluída", accountId, JSON.stringify(result));
  return result;
}
