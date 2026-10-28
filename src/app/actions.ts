"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import * as data from "@/lib/data/accounts";
import * as spyData from "@/lib/data/spy";
import { suggestTitles } from "@/lib/ai/titles";
import { lastCompleteMonth, lastCompleteWeek } from "@/lib/analytics/periods";
import { generatePeriodReport } from "@/lib/period-report";
import { deliverReport } from "@/lib/report-delivery";
import { normalizeWhatsappPhone } from "@/lib/analytics/whatsapp";
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
import { syncAnyAccount } from "@/lib/sync";
import { ACCOUNT_COOKIE, currentAccount, currentUser, INVITE_COOKIE, requirePermission } from "@/lib/session";
import { isMemberRole, normalizeEmail, validEmail, type Permission } from "@/lib/analytics/team";
import * as teamData from "@/lib/data/team";
import { safeNext } from "@/lib/next-path";
import { createDailySummary } from "@/lib/summaries";
import * as adsData from "@/lib/data/ads";
import { parseBudget, parseRoas } from "@/lib/analytics/ad-changes";
import { KINDS, type SuggestionKind } from "@/lib/analytics/ad-suggestions";
import { buildAdsReport } from "@/lib/ads-report";
import { MlAdsApi, type CampaignChange, type CampaignStrategy } from "@/lib/ml/ads-api";
import { adsWriteEnabled } from "@/lib/ml/ads-write";

// Login -------------------------------------------------------------------

const credentials = (formData: FormData) => ({
  email: String(formData.get("email") ?? "").trim().toLowerCase(),
  password: String(formData.get("password") ?? ""),
});

/** Volta do login: para o convite que a pessoa abriu, se houver; senão, o painel. */
const afterLogin = (formData: FormData) => safeNext(formData.get("next")) ?? "/dashboard";
const loginError = (formData: FormData, erro: string) => {
  const next = safeNext(formData.get("next"));
  return `/login?erro=${encodeURIComponent(erro)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
};

export async function signIn(formData: FormData) {
  try {
    await auth.api.signInEmail({ body: credentials(formData), headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) redirect(loginError(formData, "credenciais"));
    console.error("Falha no login", err);
    redirect(loginError(formData, "indisponivel"));
  }
  redirect(afterLogin(formData));
}

export async function signUp(formData: FormData) {
  const { email, password } = credentials(formData);
  try {
    await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) redirect(loginError(formData, err.message));
    console.error("Falha no cadastro", err);
    redirect(loginError(formData, "indisponivel"));
  }
  redirect(afterLogin(formData));
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

// Painel ------------------------------------------------------------------

/**
 * Conta escolhida, se o perfil da pessoa permitir a ação (currentAccount já filtra pelo
 * dono). Por padrão exige poder operar: quem é só leitura não muda nada.
 */
async function ownAccount(permission: Permission = "operar") {
  const { account } = await requirePermission(permission);
  if (!account) redirect("/configuracoes");
  return account;
}

export async function syncNow() {
  const account = await ownAccount();
  if (!account.connected) redirect("/dashboard?erro=sem-conexao");
  try {
    await syncAnyAccount(account);
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
  const { ownerId, account } = await requirePermission("operar");
  if (!account) return;
  await data.markEventsRead(ownerId, account.id);
  revalidatePath("/dashboard");
}

const money = (v: FormDataEntryValue | null) => parseMoney(String(v ?? "")) ?? 0;

export async function saveCost(formData: FormData) {
  const { ownerId } = await requirePermission("operar");
  await data.setItemCost(ownerId, String(formData.get("itemId")), money(formData.get("unitCost")), money(formData.get("extraCost")));
  revalidatePath("/produtos");
  revalidatePath("/dashboard");
}

export async function saveSettings(formData: FormData) {
  const { ownerId } = await requirePermission("gerenciar");
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
  const phoneInput = String(formData.get("whatsappPhone") ?? "").trim();
  const whatsappPhone = phoneInput ? normalizeWhatsappPhone(phoneInput) : null;
  if (phoneInput && !whatsappPhone) redirect("/configuracoes?ml=whatsapp-invalido");
  await data.saveSettings({
    owner_id: ownerId,
    tax_rate: pct("taxRate", 0.06),
    visits_drop_alert: pct("visitsDrop", 0.3),
    min_margin: pct("minMargin", 0.1),
    low_stock_days: Number.isInteger(days) && days > 0 ? days : 7,
    store_info: storeInfo,
    whatsapp_phone: whatsappPhone,
  });
  revalidatePath("/", "layout");
}

export async function disconnectAccount(formData: FormData) {
  // Só o dono, e só as próprias contas.
  const { user } = await requirePermission("dono");
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
  const { ownerId, account } = await requirePermission("operar");
  if (!account) return;
  await spyData.removeCompetitor(ownerId, account.id, String(formData.get("itemId")));
  revalidatePath("/espiao");
}

export async function suggestItemTitles(formData: FormData) {
  const { ownerId, account } = await requirePermission("operar");
  if (!account) redirect("/configuracoes");
  const item = await spyData.ownItem(ownerId, account.id, String(formData.get("itemId")));
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

const DELIVERY_PARAM = { sent: "ok", failed: "erro", "no-phone": "sem-numero", "not-configured": "desligado", "no-report": "erro" } as const;

export async function sendReportWhatsapp(formData: FormData) {
  const account = await ownAccount();
  const kind = formData.get("kind") === "monthly" ? "monthly" : "weekly";
  const start = String(formData.get("start") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) redirect("/relatorios");
  const result = await deliverReport(account.id, account.owner_id, kind, start);
  revalidatePath(`/relatorios/${kind}/${start}`);
  redirect(`/relatorios/${kind}/${start}?whatsapp=${DELIVERY_PARAM[result]}`);
}

// Publicidade: alterar e criar campanhas ------------------------------------

/** Motivo para a tela quando o ML recusa a escrita. */
function adsWriteError(err: unknown): string {
  if (err instanceof MlApiError) {
    if (err.status === 401 || err.status === 403) return "permissao";
    if (err.status === 400 || err.status === 422) return "recusado";
  }
  return "erro";
}

const errorText = (err: unknown) => (err instanceof Error ? err.message.slice(0, 500) : String(err));
const backToAds = (acao: string, anchor = "campanhas") => redirect(`/publicidade?acao=${acao}#${anchor}`);

export async function updateCampaignAction(formData: FormData) {
  const account = await ownAccount("gerenciar");
  if (!adsWriteEnabled()) return backToAds("permissao");
  const field = String(formData.get("field"));
  const raw = String(formData.get("value") ?? "");
  const c = await adsData.ownCampaign(account.owner_id, account.id, Number(formData.get("campaignId")));
  if (!c) return backToAds("nao-encontrada");
  if (!c.advertiser_id) return backToAds("sem-anunciante");

  let change: CampaignChange;
  let after: string;
  let value: string | number;
  if (field === "budget") {
    const v = parseBudget(raw);
    if (v === null) return backToAds("valor-invalido");
    change = { budget: v };
    after = String(v);
    value = v;
  } else if (field === "roas_target") {
    const v = parseRoas(raw);
    if (v === null) return backToAds("valor-invalido");
    change = { roas_target: v };
    after = String(v);
    value = v;
  } else if (field === "status" && (raw === "active" || raw === "paused")) {
    change = { status: raw };
    after = raw;
    value = raw;
  } else {
    return backToAds("valor-invalido");
  }
  const before = String(c[field as "budget" | "roas_target" | "status"] ?? "");

  let failure: string | null = null;
  try {
    await new MlAdsApi(apiFor(account.id)).updateCampaign({ advertiserId: c.advertiser_id, siteId: c.site_id }, c.id, change);
  } catch (err) {
    console.error("Alteração de campanha falhou", account.id, c.id, change, err);
    failure = adsWriteError(err);
    await adsData.recordAdsChange(account.owner_id, account.id, {
      campaign_id: c.id,
      campaign_name: c.name,
      field: field as adsData.CampaignField,
      before_value: before,
      after_value: after,
      ok: false,
      error: errorText(err),
    });
  }
  if (failure) return backToAds(failure);

  await adsData.setCampaignField(account.owner_id, account.id, c.id, field as adsData.CampaignField, value);
  await adsData.recordAdsChange(account.owner_id, account.id, {
    campaign_id: c.id,
    campaign_name: c.name,
    field: field as adsData.CampaignField,
    before_value: before,
    after_value: after,
    ok: true,
    error: null,
  });
  console.info("Campanha alterada", account.id, c.id, JSON.stringify(change));
  revalidatePath("/publicidade");
  backToAds("ok");
}

export async function createSuggestedCampaignAction(formData: FormData) {
  const account = await ownAccount("gerenciar");
  if (!adsWriteEnabled()) return backToAds("permissao", "sugestoes");
  const kind = String(formData.get("kind")) as SuggestionKind;
  if (!(kind in KINDS)) return backToAds("valor-invalido", "sugestoes");
  const budget = parseBudget(String(formData.get("budget") ?? ""));
  const roas = parseRoas(String(formData.get("roasTarget") ?? ""));
  if (budget === null || roas === null) return backToAds("valor-invalido", "sugestoes");

  // Recalcula a sugestão no servidor: nome e estratégia não vêm do navegador.
  const report = await buildAdsReport(account.owner_id, account.id);
  const s = report?.suggestions.suggestions.find((x) => x.kind === kind);
  if (!s) return backToAds("nao-encontrada", "sugestoes");
  const adv = await adsData.ownAdvertiser(account.owner_id, account.id);
  if (!adv?.advertiser_id) return backToAds("sem-anunciante", "sugestoes");
  if ((await adsData.campaignNames(account.owner_id, account.id)).has(s.name)) return backToAds("ja-existe", "sugestoes");

  const strategy = s.strategy.toLowerCase() as CampaignStrategy;
  const summary = `orçamento ${budget} · ROAS ${roas} · ${strategy}`;
  let id: number | null = null;
  let failure: string | null = null;
  try {
    id = await new MlAdsApi(apiFor(account.id)).createCampaign(
      { advertiserId: adv.advertiser_id, siteId: adv.site_id },
      { name: s.name, status: "active", budget, strategy, roas_target: roas },
    );
  } catch (err) {
    console.error("Criação de campanha falhou", account.id, s.name, err);
    failure = adsWriteError(err);
    await adsData.recordAdsChange(account.owner_id, account.id, {
      campaign_id: null,
      campaign_name: s.name,
      field: "create",
      before_value: null,
      after_value: summary,
      ok: false,
      error: errorText(err),
    });
  }
  if (failure) return backToAds(failure, "sugestoes");

  if (id !== null) await adsData.insertCreatedCampaign(account.owner_id, account.id, { id, name: s.name, strategy: s.strategy, budget, roasTarget: roas });
  await adsData.recordAdsChange(account.owner_id, account.id, {
    campaign_id: id,
    campaign_name: s.name,
    field: "create",
    before_value: null,
    after_value: summary,
    ok: true,
    error: null,
  });
  console.info("Campanha criada", account.id, id, s.name, summary);
  revalidatePath("/publicidade");
  backToAds("criada", "sugestoes");
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

// Conta ativa -------------------------------------------------------------------

export async function selectAccount(formData: FormData) {
  const { accounts } = await currentAccount();
  const id = String(formData.get("accountId") ?? "");
  if (accounts.some((a) => a.id === id)) {
    (await cookies()).set(ACCOUNT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Equipe ------------------------------------------------------------------------

export async function inviteMember(formData: FormData) {
  const { user } = await requirePermission("dono");
  const email = String(formData.get("email") ?? "");
  const role = formData.get("role");
  if (!validEmail(email) || !isMemberRole(role)) redirect("/configuracoes?equipe=invalido#equipe");
  if (normalizeEmail(email) === normalizeEmail(user.email)) redirect("/configuracoes?equipe=proprio#equipe");
  const token = await teamData.createInvite(user.id, email, role);
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: true, path: "/configuracoes", maxAge: 120 });
  revalidatePath("/configuracoes");
  redirect("/configuracoes?equipe=convidado#equipe");
}

export async function revokeInviteAction(formData: FormData) {
  const { user } = await requirePermission("dono");
  await teamData.revokeInvite(user.id, String(formData.get("invite") ?? ""));
  revalidatePath("/configuracoes");
}

export async function changeMemberRole(formData: FormData) {
  const { user } = await requirePermission("dono");
  const role = formData.get("role");
  if (isMemberRole(role)) await teamData.setMemberRole(user.id, String(formData.get("userId") ?? ""), role);
  revalidatePath("/configuracoes");
}

export async function removeMemberAction(formData: FormData) {
  const { user } = await requirePermission("dono");
  await teamData.removeMember(user.id, String(formData.get("userId") ?? ""));
  revalidatePath("/configuracoes");
}

export async function acceptInviteAction(formData: FormData) {
  const user = await currentUser();
  const token = String(formData.get("token") ?? "");
  const { result, ownerId } = await teamData.acceptInvite(token, { id: user.id, email: user.email });
  if (result !== "ok") redirect(`/convite/${encodeURIComponent(token)}?erro=${result}`);
  // Abre direto na primeira loja do dono que convidou.
  const first = (await data.accountsOf(ownerId!))[0];
  if (first) (await cookies()).set(ACCOUNT_COOKIE, first.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
