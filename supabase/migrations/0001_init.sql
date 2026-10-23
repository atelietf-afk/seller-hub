-- Seller Hub: esquema inicial (Mercado Livre).
-- Toda tabela de dados pertence a um usuário (owner_id) e é protegida por RLS.
-- Os tokens do Mercado Livre ficam em ml_tokens, sem políticas: só o service role lê.

create table public.seller_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  tax_rate numeric(5, 4) not null default 0.06,          -- alíquota sobre o faturamento (ex.: Simples 6%)
  visits_drop_alert numeric(4, 3) not null default 0.30,  -- alerta quando as visitas caem mais que isso
  low_stock_days integer not null default 7,              -- alerta quando o estoque cobre menos dias que isso
  min_margin numeric(4, 3) not null default 0.10,         -- margem mínima aceitável
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ml_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  ml_user_id bigint not null unique,
  nickname text,
  site_id text not null default 'MLB',
  reputation jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.ml_accounts (owner_id);

create table public.ml_tokens (
  account_id uuid primary key references public.ml_accounts (id) on delete cascade,
  access_token text not null,   -- criptografado (AES-256-GCM) pela aplicação
  refresh_token text not null,  -- criptografado; o ML troca o refresh token a cada uso
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.items (
  id text primary key,                       -- ex.: MLB1234567890
  account_id uuid not null references public.ml_accounts (id) on delete cascade,
  title text not null,
  price numeric(12, 2) not null,
  available_quantity integer not null default 0,
  sold_quantity integer not null default 0,
  status text not null,
  listing_type_id text,
  category_id text,
  thumbnail text,
  permalink text,
  logistic_type text,
  free_shipping boolean not null default false,
  health numeric(4, 3),
  updated_at timestamptz not null default now()
);
create index on public.items (account_id);

create table public.item_visits_daily (
  item_id text not null references public.items (id) on delete cascade,
  day date not null,
  visits integer not null,
  primary key (item_id, day)
);

create table public.product_costs (
  item_id text primary key references public.items (id) on delete cascade,
  unit_cost numeric(12, 2) not null default 0,   -- custo do produto
  extra_cost numeric(12, 2) not null default 0,  -- embalagem, etiqueta etc. por unidade
  updated_at timestamptz not null default now()
);

create table public.orders (
  id bigint primary key,
  account_id uuid not null references public.ml_accounts (id) on delete cascade,
  status text not null,
  date_created timestamptz not null,
  total_amount numeric(12, 2) not null,
  shipping_id bigint,
  shipping_cost numeric(12, 2),  -- o que o vendedor paga de frete
  buyer_id bigint,
  updated_at timestamptz not null default now()
);
create index on public.orders (account_id, date_created desc);

create table public.order_items (
  order_id bigint not null references public.orders (id) on delete cascade,
  item_id text not null,
  title text not null,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  sale_fee numeric(12, 2) not null default 0,  -- comissão do ML por unidade
  primary key (order_id, item_id)
);
create index on public.order_items (item_id);

create table public.questions (
  id bigint primary key,
  account_id uuid not null references public.ml_accounts (id) on delete cascade,
  item_id text,
  text text not null,
  status text not null,
  answer text,
  date_created timestamptz not null
);
create index on public.questions (account_id, status);

-- Linha do tempo da central ao vivo (vendas, perguntas, alertas).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ml_accounts (id) on delete cascade,
  kind text not null,          -- order | question | item_change | alert
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null,
  body text,
  item_id text,
  dedupe_key text,             -- evita repetir o mesmo alerta
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- NULLs não colidem: só eventos com dedupe_key são únicos.
  unique (account_id, dedupe_key)
);
create index on public.events (account_id, created_at desc);

-- Notificações brutas recebidas do ML (auditoria e reprocessamento).
create table public.ml_notifications (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  resource text not null,
  ml_user_id bigint not null,
  attempts integer,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index on public.ml_notifications (processed_at) where processed_at is null;

create table public.daily_summaries (
  account_id uuid not null references public.ml_accounts (id) on delete cascade,
  day date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (account_id, day)
);

-- RLS --------------------------------------------------------------------

alter table public.seller_settings enable row level security;
alter table public.ml_accounts enable row level security;
alter table public.ml_tokens enable row level security;
alter table public.items enable row level security;
alter table public.item_visits_daily enable row level security;
alter table public.product_costs enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.questions enable row level security;
alter table public.events enable row level security;
alter table public.ml_notifications enable row level security;
alter table public.daily_summaries enable row level security;

create function public.owns_account(acc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ml_accounts where id = acc and owner_id = auth.uid());
$$;

create function public.owns_item(item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from items i join ml_accounts a on a.id = i.account_id
    where i.id = item and a.owner_id = auth.uid()
  );
$$;

create policy "own settings" on public.seller_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own accounts read" on public.ml_accounts
  for select using (owner_id = auth.uid());
create policy "own accounts delete" on public.ml_accounts
  for delete using (owner_id = auth.uid());

create policy "own items" on public.items for select using (public.owns_account(account_id));
create policy "own visits" on public.item_visits_daily for select using (public.owns_item(item_id));
create policy "own costs read" on public.product_costs for select using (public.owns_item(item_id));
create policy "own costs write" on public.product_costs
  for insert with check (public.owns_item(item_id));
create policy "own costs update" on public.product_costs
  for update using (public.owns_item(item_id)) with check (public.owns_item(item_id));
create policy "own orders" on public.orders for select using (public.owns_account(account_id));
create policy "own order items" on public.order_items for select using (
  exists (select 1 from orders o where o.id = order_id and public.owns_account(o.account_id))
);
create policy "own questions" on public.questions for select using (public.owns_account(account_id));
create policy "own events read" on public.events for select using (public.owns_account(account_id));
create policy "own events mark read" on public.events
  for update using (public.owns_account(account_id)) with check (public.owns_account(account_id));
create policy "own summaries" on public.daily_summaries for select using (public.owns_account(account_id));

-- Central ao vivo: o painel escuta novos eventos pelo Supabase Realtime.
alter publication supabase_realtime add table public.events;
