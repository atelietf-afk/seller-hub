-- Espião de concorrentes e palavras-chave.

alter table items
  add column catalog_listing boolean not null default false,
  add column catalog_product_id text,
  add column pictures_count integer;

-- Dados públicos por categoria (iguais para todos os vendedores).
create table categories (
  id text primary key,
  name text not null,
  updated_at timestamptz not null default now()
);

create table category_trends (
  category_id text not null,
  position integer not null,
  keyword text not null,
  updated_at timestamptz not null default now(),
  primary key (category_id, keyword)
);

create table category_best_sellers (
  category_id text not null,
  position integer not null,
  kind text not null,                 -- ITEM | PRODUCT | USER_PRODUCT
  id text not null,
  title text,
  price numeric(12, 2),
  seller_id bigint,
  free_shipping boolean,
  logistic_type text,
  thumbnail text,
  permalink text,
  updated_at timestamptz not null default now(),
  primary key (category_id, id)
);

-- Disputa de catálogo dos anúncios do vendedor.
create table catalog_competition (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text not null,
  status text,                        -- winning | sharing_first_place | competing | listed
  price numeric(12, 2),
  price_to_win numeric(12, 2),
  winner_item_id text,
  winner_price numeric(12, 2),
  reasons jsonb,
  updated_at timestamptz not null default now(),
  primary key (account_id, item_id)
);

-- Anúncios de concorrentes que o vendedor escolheu acompanhar.
create table competitors (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text not null,              -- código do anúncio (MLB…) ou do produto de catálogo
  kind text not null default 'item' check (kind in ('item', 'product')),
  note text,
  created_at timestamptz not null default now(),
  primary key (account_id, item_id)
);

create table competitor_snapshots (
  account_id uuid not null,
  item_id text not null,
  day date not null,
  title text,
  price numeric(12, 2),
  status text,
  available_quantity integer,         -- quando o ML divulga
  sold_quantity integer,              -- quando o ML divulga
  seller_id bigint,
  free_shipping boolean,
  logistic_type text,
  thumbnail text,
  permalink text,
  primary key (account_id, item_id, day),
  foreign key (account_id, item_id) references competitors (account_id, item_id) on delete cascade
);

-- Títulos sugeridos pela IA (o último por anúncio).
create table title_suggestions (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (account_id, item_id)
);
