<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projeto

- Textos da interface e comentários em português do Brasil.
- Regras de negócio ficam em `src/lib/analytics/` como funções puras, com teste em `test/`.
- Não há RLS: o isolamento entre vendedores é feito no código. Páginas e ações pegam o usuário em `src/lib/session.ts` e só usam funções de `src/lib/data/` que filtram pelo `ownerId`. Funções só com `accountId` são para sync, webhooks e cron. Toda consulta nova que mexe em dados de vendedor precisa de teste em `test/db.test.ts`.
- Tokens do ML nunca saem do servidor nem vão para o banco sem `encrypt()`.
- Mudança de banco = nova migração em `db/migrations/` (nunca editar uma já aplicada).
- Antes de enviar: `npm run typecheck && npm test && npm run lint` (com `TEST_DATABASE_URL` para os testes de banco).
