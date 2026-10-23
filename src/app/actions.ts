"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncAccount } from "@/lib/ml/sync";
import { currentAccount, currentUser } from "@/lib/session";
import { createDailySummary } from "@/lib/summaries";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

// Login -------------------------------------------------------------------

export async function signIn(formData: FormData) {
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?erro=credenciais");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const db = await createClient();
  const { error } = await db.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { emailRedirectTo: `${appUrl()}/auth/confirm` },
  });
  if (error) redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  redirect("/login?aviso=confirme-email");
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}

// Painel ------------------------------------------------------------------

/** Confere que a conta é do usuário logado antes de usar o service role. */
async function ownAccount() {
  const { account } = await currentAccount();
  if (!account) redirect("/configuracoes");
  return account;
}

export async function syncNow() {
  const account = await ownAccount();
  await syncAccount(account.id);
  revalidatePath("/", "layout");
}

export async function summarizeNow() {
  const account = await ownAccount();
  await createDailySummary(account.id, account.owner_id);
  revalidatePath("/dashboard");
}

export async function markEventsRead() {
  const { db, account } = await currentAccount();
  if (!account) return;
  await db.from("events").update({ read_at: new Date().toISOString() }).eq("account_id", account.id).is("read_at", null);
  revalidatePath("/dashboard");
}

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function saveCost(formData: FormData) {
  const { db } = await currentUser();
  const itemId = String(formData.get("itemId"));
  // O RLS (owns_item) impede gravar custo de anúncio de outra conta.
  const { error } = await db.from("product_costs").upsert({
    item_id: itemId,
    unit_cost: money(formData.get("unitCost")),
    extra_cost: money(formData.get("extraCost")),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath("/produtos");
  revalidatePath("/dashboard");
}

export async function saveSettings(formData: FormData) {
  const { db, user } = await currentUser();
  const pct = (name: string, fallback: number) => {
    const n = Number(String(formData.get(name) ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : fallback;
  };
  const days = Number(formData.get("lowStockDays"));
  const { error } = await db.from("seller_settings").upsert({
    owner_id: user.id,
    tax_rate: pct("taxRate", 0.06),
    visits_drop_alert: pct("visitsDrop", 0.3),
    min_margin: pct("minMargin", 0.1),
    low_stock_days: Number.isInteger(days) && days > 0 ? days : 7,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function disconnectAccount(formData: FormData) {
  const { db } = await currentUser();
  await db.from("ml_accounts").delete().eq("id", String(formData.get("accountId")));
  revalidatePath("/", "layout");
}
