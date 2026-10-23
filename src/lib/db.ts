import "server-only";
import { Pool, types } from "pg";

// numeric e bigint chegam como número; datas como texto ISO (serializam direto para o cliente).
types.setTypeParser(types.builtins.NUMERIC, Number.parseFloat);
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
types.setTypeParser(types.builtins.DATE, (v) => v);

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool = (globalForPool.pgPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
}));

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}
