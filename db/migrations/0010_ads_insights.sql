-- Publicidade: ROAS objetivo (substituiu o ACOS alvo em 2026) e métricas de leilão da campanha.
alter table ads_campaigns
  add column roas_target numeric(6, 2),
  add column impression_share numeric(6, 4),     -- frações (0.35 = 35%)
  add column top_impression_share numeric(6, 4),
  add column lost_by_budget numeric(6, 4),       -- exibições perdidas por falta de orçamento
  add column lost_by_rank numeric(6, 4),         -- exibições perdidas por classificação no leilão
  add column acos_benchmark numeric(8, 4);       -- ACOS de referência do ML para campanhas parecidas
