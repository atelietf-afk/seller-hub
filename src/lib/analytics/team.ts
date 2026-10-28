// Perfis de acesso da equipe e o que cada um pode fazer.

export type Role = "dono" | "gerente" | "operador" | "leitura";
export type MemberRole = Exclude<Role, "dono">;

export const ROLE_LABEL: Record<Role, string> = {
  dono: "Dono",
  gerente: "Gerente",
  operador: "Operador",
  leitura: "Somente leitura",
};

export const ROLE_HINT: Record<MemberRole, string> = {
  gerente: "Tudo, menos conectar lojas e gerenciar a equipe.",
  operador: "Responde perguntas, sincroniza, cadastra custos, relatórios e concorrentes.",
  leitura: "Só vê os números.",
};

/** O que cada ação exige, do perfil mais baixo que pode. */
export type Permission = "operar" | "gerenciar" | "dono";

const LEVEL: Record<Role, number> = { leitura: 0, operador: 1, gerente: 2, dono: 3 };
const NEEDS: Record<Permission, number> = { operar: 1, gerenciar: 2, dono: 3 };

export function can(role: Role, permission: Permission): boolean {
  return LEVEL[role] >= NEEDS[permission];
}

export const isMemberRole = (v: unknown): v is MemberRole => v === "gerente" || v === "operador" || v === "leitura";

export const INVITE_DAYS = 7;

/** E-mail comparável: sem espaços e em minúsculas. */
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(e));
}
