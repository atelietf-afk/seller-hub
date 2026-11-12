-- Id do produto na Loja Integrada, guardado depois do envio. Evita enviar o mesmo produto duas vezes.
alter table catalog_products add column loja_integrada_id bigint;
