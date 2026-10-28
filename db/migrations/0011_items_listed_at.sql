-- Data em que o anúncio foi criado no ML (para sugerir campanha de lançamentos).
alter table items add column listed_at timestamptz;
