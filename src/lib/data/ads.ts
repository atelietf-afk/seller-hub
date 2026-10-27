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
}

export async function adsData(ownerId: string, accountId: string, days: number) {
  const status = await one<AdsAccountStatus>(
    "select ads_status, ads_error, ads_synced_at from ml_accounts where id = $1 and owner_id = $2",
    [accountId, ownerId],
  );
  if (!status) return null;
  const [campaigns, daily, items] = await Promise.all([
    query<AdsCampaignRow>("select * from ads_campaigns where account_id = $1 order by cost desc, name", [accountId]),
    query<AdsDayRow>(
      `select day, sum(clicks)::int as clicks, sum(prints)::int as prints, sum(cost) as cost, sum(revenue) as revenue,
              sum(units)::int as units
       from ads_campaign_daily where account_id = $1 and day > current_date - $2::int
       group by day order by day`,
      [accountId, days],
    ),
    query<AdsItemMetricsRow>(
      `select m.item_id, m.campaign_id, m.status, m.clicks, m.prints, m.cost, m.revenue, m.units, i.title, i.thumbnail, i.price
       from ads_item_metrics m left join items i on i.id = m.item_id
       where m.account_id = $1 order by m.cost desc`,
      [accountId],
    ),
  ]);
  return { status, campaigns, daily, items };
}
