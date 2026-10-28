-- Acesso de equipe: pessoas convidadas enxergam as contas do dono, com um perfil.
create table team_members (
  owner_id text not null references "user" (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null check (role in ('gerente', 'operador', 'leitura')),
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  check (owner_id <> user_id)
);
create index on team_members (user_id);

-- Convite por link. Guardamos só o hash do código: quem lê o banco não consegue usar o link.
create table team_invites (
  token_hash text primary key,
  owner_id text not null references "user" (id) on delete cascade,
  email text not null,
  role text not null check (role in ('gerente', 'operador', 'leitura')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by text references "user" (id) on delete set null,
  accepted_at timestamptz
);
create index on team_invites (owner_id);
