-- Controle de sincronização: quando as visitas foram buscadas e o resumo da última sincronização.
alter table ml_accounts
  add column visits_synced_at timestamptz,
  add column last_sync_result jsonb;
