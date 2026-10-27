import "server-only";
import type { AnswerDraft } from "@/lib/ai/answers";
import { one, query } from "@/lib/db";

// Perguntas dos compradores. Tudo confere o dono (ownerId).

export interface PendingQuestion {
  id: number;
  item_id: string | null;
  text: string;
  date_created: string;
  draft: AnswerDraft | null;
  draft_at: string | null;
  title: string | null;
  price: number | null;
  thumbnail: string | null;
  permalink: string | null;
  available_quantity: number | null;
}

export function pendingQuestions(ownerId: string, accountId: string) {
  return query<PendingQuestion>(
    `select q.id, q.item_id, q.text, q.date_created, q.draft, q.draft_at, i.title, i.price, i.thumbnail, i.permalink, i.available_quantity
     from questions q
     join ml_accounts a on a.id = q.account_id and a.owner_id = $2
     left join items i on i.id = q.item_id
     where q.account_id = $1 and q.status = 'UNANSWERED'
     order by q.date_created asc
     limit 200`,
    [accountId, ownerId],
  );
}

export function recentlyAnswered(ownerId: string, accountId: string, limit = 10) {
  return query<{ id: number; text: string; answer: string; answered_at: string; title: string | null }>(
    `select q.id, q.text, q.answer, q.answered_at, i.title from questions q
     join ml_accounts a on a.id = q.account_id and a.owner_id = $2
     left join items i on i.id = q.item_id
     where q.account_id = $1 and q.answered_at is not null
     order by q.answered_at desc limit $3`,
    [accountId, ownerId, limit],
  );
}

/** Pergunta pendente do usuário (para gerar rascunho ou responder). null se não for dele ou já respondida. */
export function ownPendingQuestion(ownerId: string, accountId: string, questionId: number) {
  return one<{ id: number; item_id: string | null; text: string; draft: AnswerDraft | null }>(
    `select q.id, q.item_id, q.text, q.draft from questions q join ml_accounts a on a.id = q.account_id and a.owner_id = $2
     where q.account_id = $1 and q.id = $3 and q.status = 'UNANSWERED'`,
    [accountId, ownerId, questionId],
  );
}

/** Respostas anteriores do vendedor no mesmo anúncio (exemplos para a IA). */
export function pastAnswers(accountId: string, itemId: string | null, limit = 8) {
  return query<{ question: string; answer: string }>(
    `select text as question, answer from questions
     where account_id = $1 and answer is not null and ($2::text is null or item_id = $2)
     order by date_created desc limit $3`,
    [accountId, itemId, limit],
  );
}

export async function saveDraft(accountId: string, questionId: number, draft: AnswerDraft) {
  await query("update questions set draft = $3, draft_at = now() where account_id = $1 and id = $2", [accountId, questionId, JSON.stringify(draft)]);
}

export async function markAnswered(accountId: string, questionId: number, answer: string) {
  await query(
    "update questions set status = 'ANSWERED', answer = $3, answered_at = now(), draft = null where account_id = $1 and id = $2",
    [accountId, questionId, answer],
  );
}
