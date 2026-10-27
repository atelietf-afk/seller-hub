"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import * as data from "@/lib/data/accounts";
import * as spyData from "@/lib/data/spy";
import { suggestTitles } from "@/lib/ai/titles";
import { lastCompleteMonth, lastCompleteWeek } from "@/lib/analytics/periods";
import { generatePeriodReport } from "@/lib/period-report";
import { answerProblems } from "@/lib/analytics/answers";
import { createAnswerDraft } from "@/lib/answer-drafts";
import * as questionsData from "@/lib/data/questions";
import { MlApiError } from "@/lib/ml/api";
import { mapLimit } from "@/lib/ml/store";
import { competitorTermGaps, parseListingId, trendGaps } from "@/lib/analytics/keywords";
import { MlSpyApi, type Listing } from "@/lib/ml/spy-api";
import { saveCompetitorSnapshot } from "@/lib/ml/spy-sync";
import { apiFor } from "@/lib/ml/tokens";
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
    console.error("Falha no login", err);
    redirect("/login?erro=indisponivel");
  }
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const { email, password } = credentials(formData);
  try {
    await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) redirect(`/login?erro=${encodeURIComponent(err.message)}`);
    console.error("Falha no cadastro", err);
    redirect("/login?erro=indisponivel");
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
  if (!account.connected) redirect("/dashboard?erro=sem-conexao");
  try {
    await syncAccount(account.id);
  } catch (err) {
    console.error("Sincronização manual falhou", account.id, err);
    redirect("/dashboard?erro=sync");
  }
  revalidatePath("/", "layout");
}

export async function summarizeNow() {
  const account = await ownAccount();
  try {
    await createDailySummary(account.id, account.owner_id);
  } catch (err) {
    console.error("Resumo com IA falhou", account.id, err);
    redirect("/dashboard?erro=resumo");
  }
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
  const storeInfo = String(formData.get("storeInfo") ?? "").trim().slice(0, 3000) || null;
  // A IA copia daqui para as respostas: dado de contato aqui viraria punição no ML.
  if (storeInfo && answerProblems(storeInfo).some((p) => ["phone", "email", "link", "social"].includes(p.code))) {
    redirect("/configuracoes?ml=contato-na-loja");
  }
  await data.saveSettings({
    owner_id: user.id,
    tax_rate: pct("taxRate", 0.06),
    visits_drop_alert: pct("visitsDrop", 0.3),
    min_margin: pct("minMargin", 0.1),
    low_stock_days: Number.isInteger(days) && days > 0 ? days : 7,
    store_info: storeInfo,
  });
  revalidatePath("/", "layout");
}

export async function disconnectAccount(formData: FormData) {
  const user = await currentUser();
  await data.unlinkAccount(user.id, String(formData.get("accountId")));
  revalidatePath("/", "layout");
}

// Espião ------------------------------------------------------------------

const MAX_COMPETITORS = 50;

export async function addCompetitor(formData: FormData) {
  const account = await ownAccount();
  const back = (erro: string) => redirect(`/espiao?aba=concorrentes&erro=${erro}`);
  const parsed = parseListingId(String(formData.get("link") ?? ""), account.site_id);
  if (!parsed) back("link");
  if ((await spyData.competitorCount(account.id)) >= MAX_COMPETITORS) back("limite");

  let listing: Listing | null = null;
  try {
    const spy = new MlSpyApi(apiFor(account.id));
    listing = parsed!.kind === "item" ? ((await spy.listings([parsed!.id]))[0] ?? null) : await spy.product(parsed!.id);
  } catch (err) {
    console.error("Concorrente não encontrado", parsed, err);
  }
  if (!listing) back("nao-encontrado");
  if (listing!.sellerId === Number(account.ml_user_id)) back("proprio");

  const note = String(formData.get("note") ?? "").trim().slice(0, 80) || null;
  if (!(await spyData.addCompetitor(account.owner_id, account.id, parsed!.id, parsed!.kind, note))) back("nao-encontrado");
  await saveCompetitorSnapshot(account.id, parsed!.id, listing!, new Date().toISOString().slice(0, 10));
  revalidatePath("/espiao");
  redirect("/espiao?aba=concorrentes");
}

export async function removeCompetitor(formData: FormData) {
  const { user, account } = await currentAccount();
  if (!account) return;
  await spyData.removeCompetitor(user.id, account.id, String(formData.get("itemId")));
  revalidatePath("/espiao");
}

export async function suggestItemTitles(formData: FormData) {
  const { user, account } = await currentAccount();
  if (!account) redirect("/configuracoes");
  const item = await spyData.ownItem(user.id, account.id, String(formData.get("itemId")));
  if (!item) redirect("/espiao");

  let ok = false;
  try {
    const cats = item.category_id ? [item.category_id] : [];
    const [trends, best, names] = await Promise.all([spyData.trendsFor(cats), spyData.bestSellersFor(cats), spyData.categoryNames(cats)]);
    const content = await suggestTitles({
      title: item.title,
      category: names[0]?.name ?? null,
      price: item.price,
      trendingSearches: trendGaps(item.title, trends, 10).map((t) => t.keyword),
      bestSellerTerms: competitorTermGaps(item.title, best.map((b) => b.title ?? "").filter(Boolean)).map((t) => t.term),
    });
    await spyData.saveTitleSuggestion(account.id, item.id, content);
    ok = true;
  } catch (err) {
    console.error("Sugestão de títulos falhou", item.id, err);
  }
  revalidatePath("/espiao");
  redirect(`/espiao?aba=palavras${ok ? "" : "&erro=ia"}#${item.id}`);
}

// Relatórios ---------------------------------------------------------------

export async function generateReportNow(formData: FormData) {
  const account = await ownAccount();
  const period = formData.get("kind") === "monthly" ? lastCompleteMonth(new Date()) : lastCompleteWeek(new Date());
  let ok = false;
  try {
    await generatePeriodReport(account.id, account.owner_id, period);
    ok = true;
  } catch (err) {
    console.error("Relatório falhou", account.id, period, err);
  }
  revalidatePath("/relatorios");
  redirect(ok ? `/relatorios/${period.kind}/${period.start}` : "/relatorios?erro=1");
}

// Perguntas -----------------------------------------------------------------

const MAX_BULK_DRAFTS = 10;

export async function draftAnswerAction(formData: FormData) {
  const account = await ownAccount();
  const q = await questionsData.ownPendingQuestion(account.owner_id, account.id, Number(formData.get("questionId")));
  if (!q) redirect("/perguntas");
  let ok = false;
  try {
    await createAnswerDraft(account, q);
    ok = true;
  } catch (err) {
    console.error("Rascunho de resposta falhou", q.id, err);
  }
  revalidatePath("/perguntas");
  redirect(`/perguntas${ok ? "" : "?erro=ia"}#q-${q.id}`);
}

export async function draftAllAction() {
  const account = await ownAccount();
  const pending = (await questionsData.pendingQuestions(account.owner_id, account.id)).filter((q) => !q.draft).slice(0, MAX_BULK_DRAFTS);
  let failed = 0;
  await mapLimit(pending, 3, async (q) => {
    await createAnswerDraft(account, q).catch((err) => {
      failed++;
      console.error("Rascunho de resposta falhou", q.id, err);
    });
  });
  revalidatePath("/perguntas");
  redirect(failed ? "/perguntas?erro=ia" : "/perguntas");
}

export async function sendAnswerAction(formData: FormData) {
  const account = await ownAccount();
  const q = await questionsData.ownPendingQuestion(account.owner_id, account.id, Number(formData.get("questionId")));
  if (!q) redirect("/perguntas?erro=respondida");
  const text = String(formData.get("answer") ?? "").trim();
  const back = (erro: string) => redirect(`/perguntas?erro=${erro}&q=${q!.id}#q-${q!.id}`);
  // Marcadores como "[confirmar voltagem]" indicam que o vendedor ainda precisa completar.
  const problem = answerProblems(text)[0]?.code ?? (/\[[^\]]{2,}\]/.test(text) ? "marcador" : null);
  if (problem) {
    // Guarda o que o vendedor escreveu para não perder a edição ao corrigir.
    if (text) await questionsData.saveDraft(account.id, q!.id, { confidence: "media", missing: [], ...q!.draft, answer: text });
    back(problem);
  }

  let result: "ok" | "respondida" | "ml" = "ok";
  try {
    await apiFor(account.id).answerQuestion(q!.id, text);
    await questionsData.markAnswered(account.id, q!.id, text);
  } catch (err) {
    console.error("Envio de resposta falhou", q!.id, err);
    // A pergunta pode já ter sido respondida (ou apagada) pelo app do ML.
    result = err instanceof MlApiError && [400, 404].includes(err.status) ? "respondida" : "ml";
  }
  revalidatePath("/perguntas");
  revalidatePath("/dashboard");
  if (result !== "ok") back(result);
  redirect("/perguntas?enviada=1");
}
