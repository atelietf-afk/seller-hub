-- Seller Hub: esquema inicial (Postgres / Neon).
-- Tabelas de login (user, session, account, verification) seguem o formato do Better Auth.
-- Cada dado de vendedor pertence a um usuário (owner_id). Como não há RLS, o código
-- filtra pelo dono em toda consulta (src/lib/data/*). Os tokens do ML ficam
-- criptografados em ml_tokens e nunca saem do servidor.

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

create table seller_settings (
  owner_id text primary key references "user" (id) on delete cascade,
  tax_rate numeric(5, 4) not null default 0.06,          -- alíquota sobre o faturamento (ex.: Simples 6%)
  visits_drop_alert numeric(4, 3) not null default 0.30,  -- alerta quando as visitas caem mais que isso
  low_stock_days integer not null default 7,              -- alerta quando o estoque cobre menos dias que isso
  min_margin numeric(4, 3) not null default 0.10,         -- margem mínima aceitável
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ml_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user" (id) on delete cascade,
  ml_user_id bigint not null unique,
  nickname text,
  site_id text not null default 'MLB',
  reputation jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index on ml_accounts (owner_id);

create table ml_tokens (
  account_id uuid primary key references ml_accounts (id) on delete cascade,
  access_token text not null,   -- criptografado (AES-256-GCM) pela aplicação
  refresh_token text not null,  -- criptografado; o ML troca o refresh token a cada uso
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table items (
  id text primary key,                       -- ex.: MLB1234567890
  account_id uuid not null references ml_accounts (id) on delete cascade,
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
create index on items (account_id);

create table item_visits_daily (
  item_id text not null references items (id) on delete cascade,
  day date not null,
  visits integer not null,
  primary key (item_id, day)
);

create table product_costs (
  item_id text primary key references items (id) on delete cascade,
  unit_cost numeric(12, 2) not null default 0,   -- custo do produto
  extra_cost numeric(12, 2) not null default 0,  -- embalagem, etiqueta etc. por unidade
  updated_at timestamptz not null default now()
);

create table orders (
  id bigint primary key,
  account_id uuid not null references ml_accounts (id) on delete cascade,
  status text not null,
  date_created timestamptz not null,
  total_amount numeric(12, 2) not null,
  shipping_id bigint,
  shipping_cost numeric(12, 2),  -- o que o vendedor paga de frete
  buyer_id bigint,
  updated_at timestamptz not null default now()
);
create index on orders (account_id, date_created desc);

create table order_items (
  order_id bigint not null references orders (id) on delete cascade,
  item_id text not null,
  title text not null,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  sale_fee numeric(12, 2) not null default 0,  -- comissão do ML por unidade
  primary key (order_id, item_id)
);
create index on order_items (item_id);

create table questions (
  id bigint primary key,
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text,
  text text not null,
  status text not null,
  answer text,
  date_created timestamptz not null
);
create index on questions (account_id, status);

-- Linha do tempo da central ao vivo (vendas, perguntas, alertas).
create table events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references ml_accounts (id) on delete cascade,
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
create index on events (account_id, created_at desc);

-- Notificações brutas recebidas do ML (auditoria e reprocessamento).
create table ml_notifications (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  resource text not null,
  ml_user_id bigint not null,
  attempts integer,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index on ml_notifications (processed_at) where processed_at is null;

create table daily_summaries (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  day date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (account_id, day)
);
