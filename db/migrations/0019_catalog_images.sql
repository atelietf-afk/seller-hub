-- Fotos dos produtos. Ficam no banco (sem serviço extra) e são servidas por um endereço
-- público e difícil de adivinhar, que é o que o Instagram precisa para baixar a imagem.
create table catalog_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog_products (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index on catalog_images (product_id);
