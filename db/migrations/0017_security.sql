-- Verificação em duas etapas (plugin twoFactor do Better Auth) e validade da senha.
alter table "user" add column "twoFactorEnabled" boolean default false;
-- null = senha anterior à regra de 12 caracteres: troca obrigatória no próximo acesso.
alter table "user" add column "passwordChangedAt" timestamptz;
create table "twoFactor" (
  "id" text not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "verified" boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil" timestamptz
);
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");
