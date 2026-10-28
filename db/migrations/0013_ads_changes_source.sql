-- De onde veio a mudança: feita pelo Seller Hub ou detectada na sincronização (feita no Mercado Ads).
alter table ads_changes add column source text not null default 'seller_hub' check (source in ('seller_hub', 'mercado_ads'));
