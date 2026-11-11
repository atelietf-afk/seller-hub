-- Cadastro único de produtos e os anúncios de cada loja gerados a partir dele.
create table catalog_products (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user" (id) on delete cascade,
  sku text,
  name text not null,
  description text not null default '',
  price numeric(12, 2),
  cost numeric(12, 2),
  created_at timestamptz not null default now()
);
create index on catalog_products (owner_id);

create table catalog_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog_products (id) on delete cascade,
  platform text not null check (platform in ('mercadolivre', 'shopee', 'amazon', 'loja_integrada')),
  title text not null,
  description text not null,
  keywords jsonb not null default '[]',
  to_confirm jsonb not null default '[]',
  research jsonb,
  updated_at timestamptz not null default now(),
  unique (product_id, platform)
);
