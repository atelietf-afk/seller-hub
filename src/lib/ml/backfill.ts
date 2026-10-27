import "server-only";
import { query } from "@/lib/db";
import type { MlApi } from "./api";
import { upsertOrder } from "./store";

export const HISTORY_DAYS = 120; // cobre o mês fechado anterior e o mês antes dele, para comparar
const CHUNK_DAYS = 30;
const DAY = 86_400_000;

/**
 * Busca pedidos mais antigos aos poucos (30 dias por vez, do mais novo para o mais antigo)
 * até completar HISTORY_DAYS. Para quando o tempo acaba e guarda até onde chegou, então
 * a próxima sincronização continua dali. Devolve a nova data de início do histórico.
 */
export async function backfillOrders(
  api: Pick<MlApi, "ordersBetween" | "shipmentCosts">,
  accountId: string,
  sellerId: number,
  historySince: Date,
  opts: { now?: Date; deadline: number },
): Promise<Date> {
  const target = new Date((opts.now ?? new Date()).getTime() - HISTORY_DAYS * DAY);
  let since = historySince;
  while (since > target && Date.now() < opts.deadline) {
    const chunkFrom = new Date(Math.max(target.getTime(), since.getTime() - CHUNK_DAYS * DAY));
    const orders = await api.ordersBetween(sellerId, chunkFrom, since); // mais novo primeiro
    let reached = chunkFrom;
    for (const o of orders) {
      if (Date.now() >= opts.deadline) {
        // Tempo acabou: tudo a partir deste pedido (inclusive) fica para a próxima vez.
        reached = new Date(new Date(o.date_created).getTime() + 1);
        break;
      }
      await upsertOrder(api as MlApi, accountId, sellerId, o);
    }
    since = reached;
    await query("update ml_accounts set orders_history_since = $2 where id = $1", [accountId, since.toISOString()]);
    if (reached > chunkFrom) break;
  }
  return since;
}
