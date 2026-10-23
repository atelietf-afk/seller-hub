// Aplica as migrações de db/migrations em ordem. Uso: DATABASE_URL=... npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
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
