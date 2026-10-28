import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { accountsOf } from "./data/accounts";

// Camada de acesso: toda página e ação passa por aqui para saber quem é o usuário e qual conta ele vê.

export const currentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
});

/** Cookie com a conta escolhida no seletor do topo (Mercado Livre, Shopee...). */
export const ACCOUNT_COOKIE = "sh_conta";

export const currentAccount = cache(async () => {
  const user = await currentUser();
  const accounts = await accountsOf(user.id);
  // Só vale uma conta do próprio usuário; senão, a primeira.
  const chosen = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const account = accounts.find((a) => a.id === chosen) ?? accounts[0] ?? null;
  return { user, account, accounts };
});
