-- Amazon (SP-API). O id do vendedor na Amazon (selling_partner_id) tem letras: ele vai em
-- external_id, e ml_user_id (numérico) passa a ser opcional.
alter table ml_accounts drop constraint ml_accounts_marketplace_check;
alter table ml_accounts add constraint ml_accounts_marketplace_check check (marketplace in ('mercadolivre', 'shopee', 'amazon'));
alter table ml_accounts alter column ml_user_id drop not null;
alter table ml_accounts add column external_id text;
alter table ml_accounts add constraint ml_accounts_marketplace_external_key unique (marketplace, external_id);
alter table ml_accounts add column amazon_report jsonb; -- relatório de anúncios pedido e ainda não lido

-- Token de renovação da Amazon (não expira) e o de acesso (1 hora), criptografados.
create table amazon_tokens (
  account_id uuid primary key references ml_accounts (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
