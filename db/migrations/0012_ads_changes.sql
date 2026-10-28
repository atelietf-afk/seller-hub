-- Mudanças em campanhas feitas pelo Seller Hub (histórico e medição do efeito).
create table ads_changes (
  id bigserial primary key,
  account_id uuid not null references ml_accounts (id) on delete cascade,
  campaign_id bigint,                -- null se a criação falhou
  campaign_name text not null,
  field text not null check (field in ('budget', 'roas_target', 'status', 'create')),
  before_value text,
  after_value text not null,
  ok boolean not null,
  error text,                        -- resposta do ML quando não deu certo
  created_at timestamptz not null default now()
);
create index on ads_changes (account_id, created_at desc);
