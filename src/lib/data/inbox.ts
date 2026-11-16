import "server-only";
import { query } from "@/lib/db";

// Caixa de atendimento: perguntas pendentes de todas as lojas do dono, num lugar só.

export interface InboxQuestion {
  id: number;
  account_id: string;
  store: string | null;
  text: string;
  date_created: string;
  title: string | null;
  permalink: string | null;
}

export function inboxOf(ownerId: string) {
  return query<InboxQuestion>(
    `select q.id, q.account_id, a.nickname as store, q.text, q.date_created, i.title, i.permalink
     from questions q
     join ml_accounts a on a.id = q.account_id and a.owner_id = $1
     left join items i on i.id = q.item_id
     where q.status = 'UNANSWERED'
     order by q.date_created asc
     limit 300`,
    [ownerId],
  );
}
