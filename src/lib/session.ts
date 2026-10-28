import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pendingSecurityStep } from "./analytics/security";
import { can, type Permission, type Role } from "./analytics/team";
import { auth } from "./auth";
import { accountsOfOwners } from "./data/accounts";
import { membershipsOf } from "./data/team";

// Camada de acesso: toda página e ação passa por aqui para saber quem é o usuário, qual conta
// ele vê e com qual perfil. Os dados são sempre filtrados pelo dono da conta (ownerId): para
// quem é da equipe, é o dono que convidou.

/** Usuário logado, mesmo com senha vencida ou sem duas etapas (só para a página de segurança e o convite). */
export const signedInUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
});

/** Usuário logado e em dia com a segurança (senha válida e verificação em duas etapas ativa). */
export const currentUser = cache(async () => {
  const user = await signedInUser();
  if (pendingSecurityStep(user, new Date())) redirect("/seguranca");
  return user;
});

/** Cookie com a conta escolhida no seletor do topo (Mercado Livre, Shopee, conta da equipe...). */
export const ACCOUNT_COOKIE = "sh_conta";

/** Cookie de vida curta com o código do convite recém-criado (não vai para a URL nem para o banco). */
export const INVITE_COOKIE = "sh_convite";

export const currentAccount = cache(async () => {
  const user = await currentUser();
  const memberships = await membershipsOf(user.id);
  const accounts = await accountsOfOwners([user.id, ...memberships.map((m) => m.owner_id)]);
  // Só vale uma conta a que a pessoa tem acesso; senão, a primeira.
  const chosen = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const account = accounts.find((a) => a.id === chosen) ?? accounts[0] ?? null;
  const ownerId = account?.owner_id ?? user.id;
  const role: Role = ownerId === user.id ? "dono" : (memberships.find((m) => m.owner_id === ownerId)?.role ?? "leitura");
  const ownerEmails = new Map(memberships.map((m) => [m.owner_id, m.owner_email]));
  return { user, account, accounts, ownerId, role, ownerEmails };
});

/** Para ações: confere o perfil antes de mexer em qualquer coisa. */
export async function requirePermission(permission: Permission) {
  const ctx = await currentAccount();
  if (!can(ctx.role, permission)) redirect("/dashboard?erro=sem-permissao");
  return ctx;
}
