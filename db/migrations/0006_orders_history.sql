-- Até onde o histórico de pedidos já foi buscado (a busca recua aos poucos, 30 dias por sincronização).
alter table ml_accounts add column orders_history_since timestamptz;
-- Contas que já sincronizaram têm pelo menos 30 dias antes da primeira sincronização.
update ml_accounts set orders_history_since = least(created_at, coalesce(last_synced_at, created_at)) - interval '30 days'
where last_synced_at is not null;
