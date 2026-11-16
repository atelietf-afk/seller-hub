-- Situação do produto (ativo ou inativo) no Seller Hub, espelhada na Loja Integrada quando enviado.
alter table catalog_products add column ativo boolean not null default false;
