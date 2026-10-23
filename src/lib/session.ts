import "server-only";
import { headers } from "next/headers";
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

export const currentAccount = cache(async () => {
  const user = await currentUser();
  const accounts = await accountsOf(user.id);
  return { user, account: accounts[0] ?? null, accounts };
});
