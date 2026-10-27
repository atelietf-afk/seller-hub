import "server-only";
import { draftAnswer, type AnswerDraft } from "./ai/answers";
import { settingsOf } from "./data/accounts";
import { pastAnswers, saveDraft } from "./data/questions";
import { apiFor } from "./ml/tokens";

/**
 * Monta o contexto (anúncio atualizado no ML, descrição, informações da loja e respostas
 * anteriores), pede o rascunho à IA e grava. O chamador garante que a pergunta é do usuário.
 */
export async function createAnswerDraft(
  account: { id: string; owner_id: string },
  q: { id: number; item_id: string | null; text: string },
): Promise<AnswerDraft> {
  const api = apiFor(account.id);
  const [item, description, settings, examples] = await Promise.all([
    q.item_id ? api.item(q.item_id).catch(() => null) : null,
    q.item_id ? api.itemDescription(q.item_id).catch(() => null) : null,
    settingsOf(account.owner_id),
    pastAnswers(account.id, q.item_id),
  ]);
  const draft = await draftAnswer({
    question: q.text,
    item: {
      title: item?.title ?? "(anúncio indisponível)",
      price: item?.price ?? 0,
      condition: item?.condition ?? null,
      availableQuantity: item?.available_quantity ?? 0,
      freeShipping: item?.shipping?.free_shipping ?? false,
      full: item?.shipping?.logistic_type === "fulfillment",
      attributes: (item?.attributes ?? []).filter((a) => a.value_name).map((a) => `${a.name}: ${a.value_name}`),
      saleTerms: (item?.sale_terms ?? []).filter((t) => t.value_name).map((t) => `${t.name}: ${t.value_name}`),
      description,
    },
    storeInfo: settings.store_info ?? null,
    pastAnswers: examples,
  });
  await saveDraft(account.id, q.id, draft);
  return draft;
}
