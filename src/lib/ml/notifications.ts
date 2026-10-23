import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { pushEvents, upsertItems, upsertOrder, upsertQuestion } from "./store";
import { apiFor } from "./tokens";
import type { MlNotification } from "./types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Processa uma notificação do ML. O conteúdo da notificação não é confiável
 * (o ML não assina as chamadas): usamos só o recurso indicado e buscamos os dados
 * na API com o token da conta.
 */
export async function processNotification(notificationId: string, n: MlNotification) {
  const db = adminClient();
  try {
    const { data: account } = await db.from("ml_accounts").select("id, ml_user_id").eq("ml_user_id", n.user_id).maybeSingle();
    if (!account) throw new Error(`Nenhuma conta para o usuário ${n.user_id}`);
    const api = apiFor(account.id);
    const sellerId = Number(account.ml_user_id);
    const id = n.resource.split("/").filter(Boolean).pop()!;

    switch (n.topic) {
      case "orders_v2": {
        const order = await api.order(id);
        const { isNew } = await upsertOrder(api, account.id, sellerId, order);
        if (isNew && order.status === "paid") {
          const first = order.order_items[0];
          await pushEvents(account.id, [
            {
              kind: "order",
              severity: "success",
              title: `Nova venda: ${brl(order.total_amount)}`,
              body: `${first?.quantity ?? 1}x ${first?.item.title ?? "produto"}`,
              itemId: first?.item.id,
              dedupeKey: `order:${order.id}`,
            },
          ]);
        } else if (order.status === "cancelled") {
          await pushEvents(account.id, [
            {
              kind: "order",
              severity: "warning",
              title: `Venda cancelada: ${brl(order.total_amount)}`,
              body: order.order_items[0]?.item.title,
              dedupeKey: `order-cancelled:${order.id}`,
            },
          ]);
        }
        break;
      }
      case "questions": {
        const q = await api.question(id);
        const { isNew } = await upsertQuestion(account.id, q);
        if (isNew && q.status === "UNANSWERED") {
          await pushEvents(account.id, [
            {
              kind: "question",
              severity: "info",
              title: "Nova pergunta",
              body: q.text,
              itemId: q.item_id,
              dedupeKey: `question:${q.id}`,
            },
          ]);
        }
        break;
      }
      case "items": {
        const item = await api.item(id);
        const { data: before } = await db.from("items").select("status, price").eq("id", item.id).maybeSingle();
        await upsertItems(account.id, [item]);
        if (before && before.status !== item.status) {
          await pushEvents(account.id, [
            {
              kind: "item_change",
              severity: item.status === "active" ? "info" : "warning",
              title: `Anúncio ${item.status === "active" ? "reativado" : item.status === "paused" ? "pausado" : item.status}`,
              body: item.title,
              itemId: item.id,
              dedupeKey: `status:${item.id}:${item.status}:${new Date().toISOString().slice(0, 13)}`,
            },
          ]);
        }
        break;
      }
      default:
        // Tópico ainda não tratado: fica registrado em ml_notifications.
        break;
    }
    await db.from("ml_notifications").update({ processed_at: new Date().toISOString() }).eq("id", notificationId);
  } catch (err) {
    await db
      .from("ml_notifications")
      .update({ error: err instanceof Error ? err.message : String(err) })
      .eq("id", notificationId);
    throw err;
  }
}
