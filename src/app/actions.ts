"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import * as data from "@/lib/data/accounts";
import { parseMoney } from "@/lib/format";
import { syncAccount } from "@/lib/ml/sync";
import { currentAccount, currentUser } from "@/lib/session";
import { createDailySummary } from "@/lib/summaries";

// Login -------------------------------------------------------------------

const credentials = (formData: FormData) => ({
  email: String(formData.get("email") ?? "").trim().toLowerCase(),
  password: String(formData.get("password") ?? ""),
});

export async function signIn(formData: FormData) {
  try {
    await auth.api.signInEmail({ body: credentials(formData), headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) redirect("/login?erro=credenciais");
    throw err;
  }
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const { email, password } = credentials(formData);
  try {
    await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) redirect(`/login?erro=${encodeURIComponent(err.message)}`);
    throw err;
  }
  redirect("/dashboard");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

// Painel ------------------------------------------------------------------

/** Conta do ML do usuário logado (currentAccount já filtra pelo dono). */
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
  const { user, account } = await currentAccount();
  if (!account) return;
  await data.markEventsRead(user.id, account.id);
  revalidatePath("/dashboard");
}

const money = (v: FormDataEntryValue | null) => parseMoney(String(v ?? "")) ?? 0;

export async function saveCost(formData: FormData) {
  const user = await currentUser();
  await data.setItemCost(user.id, String(formData.get("itemId")), money(formData.get("unitCost")), money(formData.get("extraCost")));
  revalidatePath("/produtos");
  revalidatePath("/dashboard");
}

export async function saveSettings(formData: FormData) {
  const user = await currentUser();
  const pct = (name: string, fallback: number) => {
    const n = parseMoney(String(formData.get(name) ?? ""));
    return n !== null && n <= 100 ? n / 100 : fallback;
  };
  const days = Number(formData.get("lowStockDays"));
  await data.saveSettings({
    owner_id: user.id,
    tax_rate: pct("taxRate", 0.06),
    visits_drop_alert: pct("visitsDrop", 0.3),
    min_margin: pct("minMargin", 0.1),
    low_stock_days: Number.isInteger(days) && days > 0 ? days : 7,
  });
  revalidatePath("/", "layout");
}

export async function disconnectAccount(formData: FormData) {
  const user = await currentUser();
  await data.unlinkAccount(user.id, String(formData.get("accountId")));
  revalidatePath("/", "layout");
}
