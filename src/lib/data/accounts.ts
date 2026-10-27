import "server-only";
import type { DailySummary } from "@/lib/ai/summary";
import { one, query } from "@/lib/db";
import type { EventRow, MlAccount, SellerSettings } from "./types";

// Acesso aos dados do vendedor. Funções que recebem ownerId só tocam no que é
// desse usuário; as que recebem só accountId são para uso interno (sync, webhooks, cron).

export function accountsOf(ownerId: string) {
  return query<MlAccount>(
    `select a.*, exists (select 1 from ml_tokens t where t.account_id = a.id) as connected
     from ml_accounts a where a.owner_id = $1 order by a.created_at`,
    [ownerId],
  );
}

export function accountById(accountId: string) {
  return one<MlAccount>("select * from ml_accounts where id = $1", [accountId]);
}

export function accountByMlUser(mlUserId: number) {
  return one<MlAccount>("select * from ml_accounts where ml_user_id = $1", [mlUserId]);
}

export function allAccounts() {
  return query<Pick<MlAccount, "id" | "owner_id">>("select id, owner_id from ml_accounts order by created_at");
}

/** Cadastra ou atualiza a conta do ML. Devolve null se ela já pertence a outro usuário. */
export async function linkAccount(
  ownerId: string,
  ml: { id: number; nickname: string; site_id: string; reputation: unknown },
): Promise<MlAccount | null> {
  return one<MlAccount>(
    `insert into ml_accounts (owner_id, ml_user_id, nickname, site_id, reputation)
     values ($1, $2, $3, $4, $5)
     on conflict (ml_user_id) do update
       set nickname = excluded.nickname, site_id = excluded.site_id, reputation = excluded.reputation
       where ml_accounts.owner_id = excluded.owner_id
     returning *`,
    [ownerId, ml.id, ml.nickname, ml.site_id, JSON.stringify(ml.reputation ?? null)],
  );
}

export async function unlinkAccount(ownerId: string, accountId: string) {
  await query("delete from ml_accounts where id = $1 and owner_id = $2", [accountId, ownerId]);
}

export async function settingsOf(ownerId: string): Promise<SellerSettings> {
  return (
    (await one<SellerSettings>("select * from seller_settings where owner_id = $1", [ownerId])) ?? {
      owner_id: ownerId,
      tax_rate: 0.06,
      visits_drop_alert: 0.3,
      low_stock_days: 7,
      min_margin: 0.1,
      store_info: null,
      whatsapp_phone: null,
    }
  );
}

export async function saveSettings(s: SellerSettings) {
  await query(
    `insert into seller_settings (owner_id, tax_rate, visits_drop_alert, low_stock_days, min_margin, store_info, whatsapp_phone)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (owner_id) do update set tax_rate = excluded.tax_rate, visits_drop_alert = excluded.visits_drop_alert,
       low_stock_days = excluded.low_stock_days, min_margin = excluded.min_margin, store_info = excluded.store_info,
       whatsapp_phone = excluded.whatsapp_phone, updated_at = now()`,
    [s.owner_id, s.tax_rate, s.visits_drop_alert, s.low_stock_days, s.min_margin, s.store_info ?? null, s.whatsapp_phone ?? null],
  );
}

/** Grava o custo só se o anúncio for de uma conta do usuário. Devolve false caso contrário. */
export async function setItemCost(ownerId: string, itemId: string, unitCost: number, extraCost: number) {
  const rows = await query(
    `insert into product_costs (item_id, unit_cost, extra_cost)
     select i.id, $3, $4 from items i join ml_accounts a on a.id = i.account_id
     where i.id = $1 and a.owner_id = $2
     on conflict (item_id) do update set unit_cost = excluded.unit_cost, extra_cost = excluded.extra_cost, updated_at = now()
     returning item_id`,
    [itemId, ownerId, unitCost, extraCost],
  );
  return rows.length > 0;
}

export function recentEvents(accountId: string, after?: string) {
  return after
    ? query<EventRow>("select * from events where account_id = $1 and created_at > $2 order by created_at desc limit 50", [accountId, after])
    : query<EventRow>("select * from events where account_id = $1 order by created_at desc limit 30", [accountId]);
}

export async function markEventsRead(ownerId: string, accountId: string) {
  await query(
    `update events set read_at = now()
     where account_id = $1 and read_at is null and exists (select 1 from ml_accounts where id = $1 and owner_id = $2)`,
    [accountId, ownerId],
  );
}

export function latestSummary(accountId: string) {
  return one<{ day: string; content: DailySummary; created_at: string }>(
    "select day, content, created_at from daily_summaries where account_id = $1 order by day desc limit 1",
    [accountId],
  );
}

export async function saveSummary(accountId: string, day: string, content: DailySummary) {
  await query(
    `insert into daily_summaries (account_id, day, content) values ($1, $2, $3)
     on conflict (account_id, day) do update set content = excluded.content, created_at = now()`,
    [accountId, day, JSON.stringify(content)],
  );
}
