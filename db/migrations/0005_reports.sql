-- Relatórios semanais e mensais (fotografia dos números do período).
create table reports (
  account_id uuid not null references ml_accounts (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  ai jsonb,                    -- análise da IA (null se não foi possível gerar)
  created_at timestamptz not null default now(),
  primary key (account_id, kind, period_start)
);
