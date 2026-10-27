-- Resultado da última sincronização do espião (para diagnóstico sem depender dos logs).
alter table ml_accounts
  add column spy_synced_at timestamptz,
  add column spy_result jsonb;
