import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

// Camada de acesso: toda página passa por aqui para saber quem é o usuário e qual conta ele vê.

export const currentUser = cache(async () => {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");
  return { db, user: data.user };
});

export const currentAccount = cache(async () => {
  const { db, user } = await currentUser();
  const { data: accounts } = await db.from("ml_accounts").select("*").order("created_at");
  return { db, user, account: accounts?.[0] ?? null, accounts: accounts ?? [] };
});
