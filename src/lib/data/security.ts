import "server-only";
import { query } from "@/lib/db";

// Datas de segurança do próprio usuário (a senha em si fica com o Better Auth).

/** Marca a senha como trocada agora: vale por 365 dias. */
export async function markPasswordChanged(userId: string) {
  await query(`update "user" set "passwordChangedAt" = now() where id = $1`, [userId]);
}
