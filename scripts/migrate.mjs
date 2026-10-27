// Aplica as migrações de db/migrations em ordem. Uso: DATABASE_URL=... npm run db:migrate
// Na Vercel roda sozinho antes de cada build (script "vercel-build").
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  // No deploy da Vercel, o primeiro build pode acontecer antes de o banco ser ligado ao projeto.
  if (process.env.VERCEL) {
    console.warn("DATABASE_URL ausente: migrações não aplicadas. Ligue o banco Neon ao projeto e faça um novo deploy.");
    process.exit(0);
  }
  console.error("Defina DATABASE_URL");
  process.exit(1);
}
// O pg trata sslmode=require como verify-full; explícito para não gerar aviso (igual a src/lib/db.ts).
const client = new pg.Client({ connectionString: url.replace(/([?&])sslmode=(prefer|require|verify-ca)\b/, "$1sslmode=verify-full") });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
const dir = new URL("../db/migrations/", import.meta.url);
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const sql = await readFile(new URL(file, dir), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`aplicada: ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`falhou: ${file}`);
    throw err;
  }
}
await client.end();
