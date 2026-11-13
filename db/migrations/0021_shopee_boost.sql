-- Histórico do impulsionamento automático da Shopee: quando cada produto foi impulsionado pela última vez.
create table shopee_boosts (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  item_id text not null,
  boosted_at timestamptz not null default now(),
  primary key (account_id, item_id)
);
