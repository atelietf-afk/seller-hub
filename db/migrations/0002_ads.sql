-- Publicidade (Product Ads do Mercado Livre).

alter table ml_accounts
  add column ads_advertiser_id bigint,
  add column ads_status text,          -- ok | sem_product_ads | erro
  add column ads_error text,           -- última falha da API de publicidade (para diagnóstico)
  add column ads_synced_at timestamptz;

create table ads_campaigns (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  id bigint not null,
  name text not null,
  status text,
  strategy text,
  budget numeric(12, 2),
  acos_target numeric(8, 4),        -- em fração (0.15 = 15%)
  -- Totais do período sincronizado (period_days): servem mesmo se a API não der o detalhe diário.
  period_days integer not null default 30,
  clicks integer not null default 0,
  prints integer not null default 0,
  cost numeric(12, 2) not null default 0,
  revenue numeric(12, 2) not null default 0,
  units integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

-- Métricas diárias por campanha. revenue = vendas atribuídas aos anúncios (diretas + indiretas).
create table ads_campaign_daily (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  campaign_id bigint not null,
  day date not null,
  clicks integer not null default 0,
  prints integer not null default 0,
  cost numeric(12, 2) not null default 0,
  revenue numeric(12, 2) not null default 0,
  units integer not null default 0,
  primary key (account_id, campaign_id, day)
);
create index on ads_campaign_daily (account_id, day);

-- Totais por anúncio (produto) nos últimos period_days dias, quando a API fornece.
create table ads_item_metrics (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text not null,
  campaign_id bigint,
  status text,
  period_days integer not null,
  clicks integer not null default 0,
  prints integer not null default 0,
  cost numeric(12, 2) not null default 0,
  revenue numeric(12, 2) not null default 0,
  units integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, item_id)
);
