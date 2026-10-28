-- Mais de um marketplace. A tabela ml_accounts passa a guardar contas de qualquer
-- marketplace (o nome ficou do começo do projeto): ml_user_id é o id do vendedor/loja
-- no marketplace (user_id no Mercado Livre, shop_id na Shopee).
alter table ml_accounts add column marketplace text not null default 'mercadolivre'
  check (marketplace in ('mercadolivre', 'shopee'));
alter table ml_accounts drop constraint ml_accounts_ml_user_id_key;
alter table ml_accounts add constraint ml_accounts_marketplace_user_key unique (marketplace, ml_user_id);

-- Pedidos da Shopee têm código com letras (order_sn): o id do pedido vira texto.
alter table order_items drop constraint order_items_order_id_fkey;
alter table orders alter column id type text using id::text;
alter table order_items alter column order_id type text using order_id::text;
alter table order_items add constraint order_items_order_id_fkey foreign key (order_id) references orders (id) on delete cascade;

-- Tokens da Shopee (por loja). Guardados criptografados, como os do ML.
create table shopee_tokens (
  account_id uuid primary key references ml_accounts (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,   -- refresh_token vale 30 dias
  updated_at timestamptz not null default now()
);
