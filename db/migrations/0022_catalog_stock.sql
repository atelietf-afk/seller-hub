-- Estoque único do produto: a quantidade fica aqui e é enviada às lojas que ela controla.
alter table catalog_products add column stock_quantity integer not null default 0 check (stock_quantity >= 0);
