import "server-only";
import { query } from "@/lib/db";
import { MlApiError } from "./api";
import { MlAdsApi } from "./ads-api";
import { apiFor } from "./tokens";

export const ADS_PERIOD_DAYS = 30;

export interface AdsSyncResult {
  status: "ok" | "sem_product_ads" | "erro";
  campaigns: number;
  dailyRows: number;
  items: number | null; // null: a API não deu o detalhe por anúncio
  itemsSource?: "ads" | "ad_groups" | null;
  /** Quantos campos de leilão vieram (impression_share etc.), para conferir se a API entregou. */
  insights?: number;
  /** Grupos de anúncios encontrados no caminho novo (conferência antes do antigo ser desligado). */
  adGroups?: number | string;
  error?: string;
}

/**
 * Sincroniza Product Ads dos últimos 30 dias. Nunca lança erro: a publicidade é um
 * extra e não pode derrubar a sincronização principal. O resultado fica em
 * ml_accounts.ads_status / ads_error para o painel e para diagnóstico.
 */
export async function syncAds(accountId: string): Promise<AdsSyncResult> {
  const ads = new MlAdsApi(apiFor(accountId));
  const to = new Date();
  const from = new Date(to.getTime() - (ADS_PERIOD_DAYS - 1) * 86400_000);

  const finish = async (r: AdsSyncResult, advertiserId: number | null = null) => {
    await query(
      `update ml_accounts set ads_status = $2, ads_error = $3, ads_advertiser_id = coalesce($4, ads_advertiser_id), ads_synced_at = now()
       where id = $1`,
      [accountId, r.status, r.error ?? null, advertiserId],
    );
    if (r.status === "erro") console.error("Sincronização de publicidade falhou", accountId, r.error);
    else console.info("Publicidade sincronizada", accountId, JSON.stringify(r));
    return r;
  };

  try {
    const advertiser = await ads.advertiser();
    if (!advertiser) return finish({ status: "sem_product_ads", campaigns: 0, dailyRows: 0, items: null });

    // Sem repetir campanha (a paginação da API pode sobrepor páginas).
    const campaigns = [...new Map((await ads.campaigns(advertiser, from, to)).map((c) => [c.id, c])).values()];
    const daily = await ads.campaignsDaily(advertiser, from, to).catch((err) => {
      console.warn("Métricas diárias de publicidade indisponíveis", accountId, String(err));
      return [];
    });
    const items = await ads.items(advertiser, from, to);
    // Enquanto o caminho antigo funciona, confere se o novo (por grupos) responde, para trocar sem susto.
    const adGroups =
      ads.itemsSource === "ads"
        ? await ads.adGroups(advertiser).then(
            (g) => g.length,
            (err) => (err instanceof MlApiError ? `erro ${err.status}` : "erro"),
          )
        : undefined;

    await query(
      `insert into ads_campaigns (account_id, id, name, status, strategy, budget, acos_target, roas_target, impression_share,
         top_impression_share, lost_by_budget, lost_by_rank, acos_benchmark, period_days, clicks, prints, cost, revenue, units)
       select $1::uuid, (c->>'id')::bigint, c->>'name', c->>'status', c->>'strategy', (c->>'budget')::numeric, (c->>'acosTarget')::numeric,
              (c->>'roasTarget')::numeric, (c->>'impressionShare')::numeric, (c->>'topImpressionShare')::numeric,
              (c->>'lostByBudget')::numeric, (c->>'lostByRank')::numeric, (c->>'acosBenchmark')::numeric,
              $3::int, (c->>'clicks')::int, (c->>'prints')::int, (c->>'cost')::numeric, (c->>'revenue')::numeric, (c->>'units')::int
       from json_array_elements($2::json) c
       on conflict (account_id, id) do update set name = excluded.name, status = excluded.status, strategy = excluded.strategy,
         budget = excluded.budget, acos_target = excluded.acos_target, roas_target = excluded.roas_target,
         impression_share = excluded.impression_share, top_impression_share = excluded.top_impression_share,
         lost_by_budget = excluded.lost_by_budget, lost_by_rank = excluded.lost_by_rank, acos_benchmark = excluded.acos_benchmark,
         period_days = excluded.period_days, clicks = excluded.clicks, prints = excluded.prints, cost = excluded.cost,
         revenue = excluded.revenue, units = excluded.units, updated_at = now()`,
      [accountId, JSON.stringify(campaigns), ADS_PERIOD_DAYS],
    );
    if (daily.length) {
      await query(
        `insert into ads_campaign_daily (account_id, campaign_id, day, clicks, prints, cost, revenue, units)
         select $1::uuid, (d->>'campaignId')::bigint, (d->>'day')::date, sum((d->>'clicks')::int), sum((d->>'prints')::int),
                sum((d->>'cost')::numeric), sum((d->>'revenue')::numeric), sum((d->>'units')::int)
         from json_array_elements($2::json) d
         group by 1, 2, 3
         on conflict (account_id, campaign_id, day) do update set clicks = excluded.clicks, prints = excluded.prints,
           cost = excluded.cost, revenue = excluded.revenue, units = excluded.units`,
        [accountId, JSON.stringify(daily)],
      );
    }
    if (items) {
      await query("delete from ads_item_metrics where account_id = $1", [accountId]);
      // Um anúncio pode aparecer em mais de uma linha (ex.: trocou de campanha): soma tudo.
      await query(
        `insert into ads_item_metrics (account_id, item_id, campaign_id, status, period_days, clicks, prints, cost, revenue, units)
         select $1::uuid, i->>'itemId', max((i->>'campaignId')::bigint), max(i->>'status'), $3::int, sum((i->>'clicks')::int),
                sum((i->>'prints')::int), sum((i->>'cost')::numeric), sum((i->>'revenue')::numeric), sum((i->>'units')::int)
         from json_array_elements($2::json) i
         group by i->>'itemId'`,
        [accountId, JSON.stringify(items), ADS_PERIOD_DAYS],
      );
    }
    const insights = campaigns.filter((c) => c.impressionShare !== null || c.lostByBudget !== null || c.lostByRank !== null).length;
    return finish(
      {
        status: "ok",
        campaigns: campaigns.length,
        dailyRows: daily.length,
        items: items ? items.length : null,
        itemsSource: ads.itemsSource,
        insights,
        ...(adGroups !== undefined ? { adGroups } : {}),
      },
      advertiser.advertiserId,
    );
  } catch (err) {
    const error = err instanceof MlApiError ? `${err.status} em ${err.path.split("?")[0]}` : err instanceof Error ? err.message : String(err);
    return finish({ status: "erro", campaigns: 0, dailyRows: 0, items: null, error });
  }
}
