import "server-only";
import { one, query } from "@/lib/db";

// Leitura da publicidade. Tudo passa pela checagem de dono (ownerId).

export interface AdsAccountStatus {
  ads_status: "ok" | "sem_product_ads" | "erro" | null;
  ads_error: string | null;
  ads_synced_at: string | null;
}

export interface AdsCampaignRow {
  id: number;
  name: string;
  status: string | null;
  strategy: string | null;
  budget: number | null;
  acos_target: number | null;
  roas_target: number | null;
  impression_share: number | null;
  top_impression_share: number | null;
  lost_by_budget: number | null;
  lost_by_rank: number | null;
  acos_benchmark: number | null;
  period_days: number;
  clicks: number;
  prints: number;
  cost: number;
  revenue: number;
  units: number;
}

export interface AdsDayRow {
  day: string;
  clicks: number;
  prints: number;
  cost: number;
  revenue: number;
  units: number;
}

export interface AdsItemMetricsRow {
  item_id: string;
  campaign_id: number | null;
  status: string | null;
  clicks: number;
  prints: number;
  cost: number;
  revenue: number;
  units: number;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  stock: number | null;
  item_status: string | null;
}

/** Últimos 7 dias e os 7 anteriores de cada campanha (tendência e uso do orçamento). */
export interface AdsCampaignWeeks {
  campaign_id: number;
  cost7: number;
  revenue7: number;
  cost_prev7: number;
  revenue_prev7: number;
}

export async function adsData(ownerId: string, accountId: string, days: number) {
  const status = await one<AdsAccountStatus>(
    "select ads_status, ads_error, ads_synced_at from ml_accounts where id = $1 and owner_id = $2",
    [accountId, ownerId],
  );
  if (!status) return null;
  const [campaigns, daily, items, weeks, listed] = await Promise.all([
    query<AdsCampaignRow>("select * from ads_campaigns where account_id = $1 order by cost desc, name", [accountId]),
    query<AdsDayRow>(
      `select day, sum(clicks)::int as clicks, sum(prints)::int as prints, sum(cost) as cost, sum(revenue) as revenue,
              sum(units)::int as units
       from ads_campaign_daily where account_id = $1 and day > current_date - $2::int
       group by day order by day`,
      [accountId, days],
    ),
    query<AdsItemMetricsRow>(
      `select m.item_id, m.campaign_id, m.status, m.clicks, m.prints, m.cost, m.revenue, m.units, i.title, i.thumbnail, i.price,
              i.available_quantity as stock, i.status as item_status
       from ads_item_metrics m left join items i on i.id = m.item_id
       where m.account_id = $1 order by m.cost desc`,
      [accountId],
    ),
    // A API fecha o dia de ontem; "últimos 7" são os 7 dias até o mais recente com dado.
    query<AdsCampaignWeeks>(
      `with last as (select max(day) as d from ads_campaign_daily where account_id = $1)
       select campaign_id,
              coalesce(sum(cost) filter (where day > last.d - 7), 0) as cost7,
              coalesce(sum(revenue) filter (where day > last.d - 7), 0) as revenue7,
              coalesce(sum(cost) filter (where day <= last.d - 7 and day > last.d - 14), 0) as cost_prev7,
              coalesce(sum(revenue) filter (where day <= last.d - 7 and day > last.d - 14), 0) as revenue_prev7
       from ads_campaign_daily, last
       where account_id = $1 and day > last.d - 14
       group by campaign_id`,
      [accountId],
    ),
    query<{ id: string; listed_at: string | null }>("select id, listed_at from items where account_id = $1", [accountId]),
  ]);
  return { status, campaigns, daily, items, weeks, listedAt: new Map(listed.map((l) => [l.id, l.listed_at])) };
}

// Escrita em campanhas --------------------------------------------------------

export interface OwnCampaign {
  id: number;
  name: string;
  status: string | null;
  strategy: string | null;
  budget: number | null;
  roas_target: number | null;
  advertiser_id: number | null;
  site_id: string;
}

/** A campanha, só se for de uma conta do usuário. */
export function ownCampaign(ownerId: string, accountId: string, campaignId: number) {
  return one<OwnCampaign>(
    `select c.id, c.name, c.status, c.strategy, c.budget, c.roas_target, a.ads_advertiser_id as advertiser_id, a.site_id
     from ads_campaigns c join ml_accounts a on a.id = c.account_id and a.owner_id = $2
     where c.account_id = $1 and c.id = $3`,
    [accountId, ownerId, campaignId],
  );
}

/** Conta de anunciante do usuário (para criar campanha). */
export function ownAdvertiser(ownerId: string, accountId: string) {
  return one<{ advertiser_id: number | null; site_id: string }>(
    "select ads_advertiser_id as advertiser_id, site_id from ml_accounts where id = $1 and owner_id = $2",
    [accountId, ownerId],
  );
}

/** Nomes de campanhas que já existem na conta (para não criar duplicada). */
export async function campaignNames(ownerId: string, accountId: string) {
  const rows = await query<{ name: string }>(
    `select c.name from ads_campaigns c join ml_accounts a on a.id = c.account_id and a.owner_id = $2 where c.account_id = $1`,
    [accountId, ownerId],
  );
  return new Set(rows.map((r) => r.name));
}

export type CampaignField = "budget" | "roas_target" | "status";

/** Reflete na hora a mudança aceita pelo ML (a próxima sincronização confirma). Só na campanha do usuário. */
export async function setCampaignField(ownerId: string, accountId: string, campaignId: number, field: CampaignField, value: string | number) {
  const column = { budget: "budget", roas_target: "roas_target", status: "status" }[field];
  await query(
    `update ads_campaigns c set ${column} = $4, updated_at = now() from ml_accounts a
     where a.id = c.account_id and a.owner_id = $2 and c.account_id = $1 and c.id = $3`,
    [accountId, ownerId, campaignId, value],
  );
}

/** Guarda a campanha recém-criada até a próxima sincronização trazer os números. */
export async function insertCreatedCampaign(
  ownerId: string,
  accountId: string,
  c: { id: number; name: string; strategy: string; budget: number; roasTarget: number },
) {
  await query(
    `insert into ads_campaigns (account_id, id, name, status, strategy, budget, roas_target)
     select a.id, $3, $4, 'active', $5, $6, $7 from ml_accounts a where a.id = $1 and a.owner_id = $2
     on conflict (account_id, id) do nothing`,
    [accountId, ownerId, c.id, c.name, c.strategy, c.budget, c.roasTarget],
  );
}

export interface AdsChangeRow {
  id: number;
  campaign_id: number | null;
  campaign_name: string;
  field: CampaignField | "create";
  before_value: string | null;
  after_value: string;
  ok: boolean;
  error: string | null;
  created_at: string;
}

export async function recordAdsChange(
  ownerId: string,
  accountId: string,
  c: Omit<AdsChangeRow, "id" | "created_at">,
) {
  await query(
    `insert into ads_changes (account_id, campaign_id, campaign_name, field, before_value, after_value, ok, error)
     select a.id, $3, $4, $5, $6, $7, $8, $9 from ml_accounts a where a.id = $1 and a.owner_id = $2`,
    [accountId, ownerId, c.campaign_id, c.campaign_name, c.field, c.before_value, c.after_value, c.ok, c.error],
  );
}

/** Mudanças dos últimos 60 dias e as métricas diárias das campanhas envolvidas, para medir o efeito. */
export async function adsChanges(ownerId: string, accountId: string) {
  const changes = await query<AdsChangeRow>(
    `select x.id, x.campaign_id, x.campaign_name, x.field, x.before_value, x.after_value, x.ok, x.error, x.created_at
     from ads_changes x join ml_accounts a on a.id = x.account_id and a.owner_id = $2
     where x.account_id = $1 and x.created_at > now() - interval '60 days'
     order by x.created_at desc limit 50`,
    [accountId, ownerId],
  );
  const ids = [...new Set(changes.filter((c) => c.ok && c.campaign_id !== null).map((c) => c.campaign_id!))];
  const daily = ids.length
    ? await query<{ campaign_id: number; day: string; cost: number; revenue: number }>(
        `select campaign_id, day, cost, revenue from ads_campaign_daily where account_id = $1 and campaign_id = any($2::bigint[])`,
        [accountId, ids],
      )
    : [];
  return { changes, daily };
}
