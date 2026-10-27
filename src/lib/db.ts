import "server-only";
import { Pool, types } from "pg";

// numeric e bigint chegam como número; datas como texto ISO (serializam direto para o cliente).
types.setTypeParser(types.builtins.NUMERIC, Number.parseFloat);
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
types.setTypeParser(types.builtins.DATE, (v) => v);

const globalForPool = globalThis as unknown as { pgPool?: Pool };

/** O pg trata sslmode=require como verify-full; deixamos explícito para não gerar aviso a cada conexão. */
export function normalizeSslMode(url: string | undefined) {
  return url?.replace(/([?&])sslmode=(prefer|require|verify-ca)\b/, "$1sslmode=verify-full");
}

function createPool() {
  const p = new Pool({
    connectionString: normalizeSslMode(process.env.DATABASE_URL),
    max: 5,
    // O Neon gratuito hiberna quando fica parado; acordar leva alguns segundos.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
  // O Neon fecha conexões ociosas. Sem este handler, o erro derrubaria a função.
  p.on("error", (err) => console.warn("Conexão ociosa com o banco encerrada:", err.message));
  return p;
}

export const pool: Pool = (globalForPool.pgPool ??= createPool());

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}
