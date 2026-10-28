// Testes contra um Postgres de verdade. Rodam só com TEST_DATABASE_URL definido
// (o banco é apagado e recriado a cada execução — nunca aponte para produção).
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("banco de dados", () => {
  let db: typeof import("@/lib/db");
  let data: typeof import("@/lib/data/accounts");
  let store: typeof import("@/lib/ml/store");
  let tokens: typeof import("@/lib/ml/tokens");
  let report: typeof import("@/lib/report");
  let auth: typeof import("@/lib/auth");
  let adsSync: typeof import("@/lib/ml/ads-sync");
  let adsReport: typeof import("@/lib/ads-report");
  let spySync: typeof import("@/lib/ml/spy-sync");
  let spyData: typeof import("@/lib/data/spy");
  let periodReport: typeof import("@/lib/period-report");
  let reportsData: typeof import("@/lib/data/reports");
  let periods: typeof import("@/lib/analytics/periods");
  let backfill: typeof import("@/lib/ml/backfill");
  let sync: typeof import("@/lib/ml/sync");
  let questionsData: typeof import("@/lib/data/questions");
  let delivery: typeof import("@/lib/report-delivery");
  let sales: typeof import("@/lib/data/sales");
  let adsData: typeof import("@/lib/data/ads");
  let shopeeSync: typeof import("@/lib/shopee/sync");
  let shopeeTokens: typeof import("@/lib/shopee/tokens");
  let amazonSync: typeof import("@/lib/amazon/sync");
  let amazonTokens: typeof import("@/lib/amazon/tokens");
  let team: typeof import("@/lib/data/team");
  const A = "user-a";
  const B = "user-b";
  let accA: string;
  let accB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.ML_CLIENT_ID = "123";
    process.env.ML_CLIENT_SECRET = "s";
    db = await import("@/lib/db");
    data = await import("@/lib/data/accounts");
    store = await import("@/lib/ml/store");
    tokens = await import("@/lib/ml/tokens");
    report = await import("@/lib/report");
    adsSync = await import("@/lib/ml/ads-sync");
    adsReport = await import("@/lib/ads-report");
    spySync = await import("@/lib/ml/spy-sync");
    spyData = await import("@/lib/data/spy");
    periodReport = await import("@/lib/period-report");
    reportsData = await import("@/lib/data/reports");
    periods = await import("@/lib/analytics/periods");
    backfill = await import("@/lib/ml/backfill");
    sync = await import("@/lib/ml/sync");
    questionsData = await import("@/lib/data/questions");
    delivery = await import("@/lib/report-delivery");
    sales = await import("@/lib/data/sales");
    adsData = await import("@/lib/data/ads");
    shopeeSync = await import("@/lib/shopee/sync");
    shopeeTokens = await import("@/lib/shopee/tokens");
    amazonSync = await import("@/lib/amazon/sync");
    amazonTokens = await import("@/lib/amazon/tokens");
    team = await import("@/lib/data/team");

    await db.query("drop schema public cascade; create schema public;");
    const dir = new URL("../db/migrations/", import.meta.url);
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile(new URL(f, dir), "utf8"));
    auth = await import("@/lib/auth"); // o Better Auth confere as tabelas ao iniciar
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ($1, 'A', 'a@x.com', true), ($2, 'B', 'b@x.com', true)`, [A, B]);
    accA = (await data.linkAccount(A, { id: 1, nickname: "loja_a", site_id: "MLB", reputation: { level_id: "5_green" } }))!.id;
    accB = (await data.linkAccount(B, { id: 2, nickname: "loja_b", site_id: "MLB", reputation: null }))!.id;
    const item = (id: string) => ({ id, title: id, price: 100, available_quantity: 10, sold_quantity: 0, status: "active" });
    await store.upsertItems(accA, [item("MLBA1"), item("MLBA2")]);
    await store.upsertItems(accB, [item("MLBB1")]);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it("indica se a conta concluiu a conexão (tem tokens)", async () => {
    expect((await data.accountsOf(B))[0].connected).toBe(false);
    await tokens.saveTokens(accB, { access_token: "a", refresh_token: "r", expires_in: 21600, user_id: 2 });
    expect((await data.accountsOf(B))[0].connected).toBe(true);
    await expect(tokens.saveTokens(accB, { access_token: "a", expires_in: 21600, user_id: 2 })).rejects.toThrow(/offline_access/);
  });

  it("não deixa outro usuário assumir uma conta do ML já vinculada", async () => {
    expect(await data.linkAccount(B, { id: 1, nickname: "x", site_id: "MLB", reputation: null })).toBeNull();
    expect((await data.accountsOf(A)).map((a) => a.nickname)).toEqual(["loja_a"]);
  });

  it("só grava custo em anúncio do próprio usuário", async () => {
    expect(await data.setItemCost(A, "MLBA1", 40, 2)).toBe(true);
    expect(await data.setItemCost(A, "MLBB1", 1, 0)).toBe(false);
    expect(await db.query("select item_id from product_costs order by item_id")).toEqual([{ item_id: "MLBA1" }]);
  });

  it("não marca eventos nem desconecta conta de outro usuário", async () => {
    await store.pushEvents(accB, [{ kind: "alert", title: "x", dedupeKey: "k" }]);
    await data.markEventsRead(A, accB);
    expect((await data.recentEvents(accB))[0].read_at).toBeNull();
    await data.unlinkAccount(A, accB);
    expect(await data.accountById(accB)).not.toBeNull();
  });

  it("não repete eventos com a mesma chave", async () => {
    const ev = { kind: "alert" as const, title: "Sem estoque", dedupeKey: "no-stock:MLBA1:2026-10-23" };
    await store.pushEvents(accA, [ev, { kind: "order", title: "sem chave" }]);
    await store.pushEvents(accA, [ev, { kind: "order", title: "sem chave" }]);
    const events = await data.recentEvents(accA);
    expect(events.filter((e) => e.title === "Sem estoque")).toHaveLength(1);
    expect(events.filter((e) => e.title === "sem chave")).toHaveLength(2);
  });

  it("grava pedidos, perguntas e visitas e monta o relatório com lucro real", async () => {
    const api = { shipmentCosts: vi.fn(async () => ({ senders: [{ user_id: 1, cost: 20 }] })) };
    const order = {
      id: 9001,
      status: "paid",
      date_created: new Date().toISOString(),
      total_amount: 200,
      shipping: { id: 77 },
      order_items: [{ item: { id: "MLBA1", title: "MLBA1" }, quantity: 2, unit_price: 100, sale_fee: 14 }],
    };
    expect((await store.upsertOrder(api as never, accA, 1, order)).isNew).toBe(true);
    expect((await store.upsertOrder(api as never, accA, 1, order)).isNew).toBe(false);
    expect(api.shipmentCosts).toHaveBeenCalledTimes(1); // o frete não é buscado de novo

    const q = { id: 5, item_id: "MLBA1", text: "Tem azul?", status: "UNANSWERED", date_created: new Date().toISOString() };
    expect((await store.upsertQuestion(accA, q)).isNew).toBe(true);
    expect((await store.upsertQuestion(accA, { ...q, status: "ANSWERED" })).isNew).toBe(false);
    await store.upsertQuestion(accA, { ...q, id: 6 });

    const today = periods.localDay(new Date()); // o relatório conta os dias no horário de Brasília
    await store.saveVisits("MLBA1", [{ day: today, visits: 50 }]);
    await store.saveVisits("MLBA1", [{ day: today, visits: 80 }]);

    const r = await report.buildReport(accA, A, 7);
    // 200 de venda − 28 comissão − 20 frete − 12 imposto (6%) − 84 custo = 56
    expect(r.totals).toMatchObject({ revenue: 200, fees: 28, shipping: 20, tax: 12, productCost: 84, profit: 56, orders: 1, units: 2, visits: 80 });
    expect(r.unansweredQuestions).toBe(1);
    expect(r.missingCosts).toBe(1); // MLBA2 sem custo
    expect(r.funnel.find((f) => f.itemId === "MLBA1")).toMatchObject({ orders: 1, visits: 80, unitCost: 40 });
    expect(r.daily.reduce((a, d) => a + d.revenue, 0)).toBe(200);
  });

  it("renova o token vencido uma vez só, mesmo com chamadas simultâneas", async () => {
    await tokens.saveTokens(accA, { access_token: "old", refresh_token: "r1", expires_in: 0, user_id: 1 });
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      await new Promise((r) => setTimeout(r, 30));
      if (n > 1) return new Response("invalid_grant", { status: 400 }); // refresh token já gasto: não pode acontecer
      return new Response(JSON.stringify({ access_token: "new", refresh_token: "r2", expires_in: 21600, user_id: 1 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const results = await Promise.all([tokens.validAccessToken(accA), tokens.validAccessToken(accA)]);
      expect(results).toEqual(["new", "new"]);
      expect(await tokens.validAccessToken(accA)).toBe("new");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
    const [row] = await db.query<{ access_token: string }>("select access_token from ml_tokens where account_id = $1", [accA]);
    expect(row.access_token).not.toContain("new"); // guardado criptografado
  });

  it("sincroniza a publicidade e cruza com o lucro, sem vazar para outro usuário", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/advertising/advertisers?product_id=PADS")) return respond({ advertisers: [{ advertiser_id: 9, site_id: "MLB" }] });
        if (u.includes("/product_ads/campaigns/5?"))
          return respond({
            id: 5,
            roas_target: 2,
            metrics: { impression_share: 40, lost_impression_share_by_budget: 25, lost_impression_share_by_ad_rank: 35 },
          });
        if (u.includes("/product_ads/campaigns")) {
          if (u.includes("aggregation_type=DAILY")) return respond({ results: [{ campaign_id: 5, date: today, cost: 20, total_amount: 200 }] });
          return respond({
            results: [
              {
                id: 5,
                name: "Fones",
                status: "active",
                strategy: "PROFITABILITY",
                budget: 30,
                metrics: { clicks: 40, prints: 4000, cost: 20, total_amount: 200, units_quantity: 2 },
              },
            ],
          });
        }
        if (u.includes("/product_ads/ads/search"))
          return respond({ results: [{ item_id: "MLBA1", campaign_id: 5, metrics: { clicks: 40, prints: 4000, cost: 20, total_amount: 200, units_quantity: 2 } }] });
        if (u.includes("/product_ads/ad_groups/search")) return respond({ results: [{ id: 77, campaign_id: 5 }] });
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", campaigns: 1, dailyRows: 1, items: 1, itemsSource: "ads", insights: 1, roasTargets: 1 });
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok" }); // rodar de novo não duplica
    } finally {
      vi.unstubAllGlobals();
    }

    const r = (await adsReport.buildAdsReport(A, accA))!;
    expect(r.totals).toMatchObject({ cost: 20, revenue: 200, clicks: 40 });
    expect(r.totals.acos).toBeCloseTo(0.1);
    expect(r.profitAfterAds).toBe(r.profitBeforeAds - 20);
    expect(r.campaigns).toHaveLength(1);
    expect(r.daily.find((d) => d.day === today)).toMatchObject({ cost: 20, revenue: 200 });
    const item = r.items!.find((i) => i.item_id === "MLBA1")!;
    expect(item.title).toBe("MLBA1");
    expect(item.breakEvenAcos).toBeCloseTo(0.28); // margem do MLBA1: 56 / 200
    expect(item.breakEvenRoas).toBeCloseTo(1 / 0.28);
    expect(item.decision).toBe("escalar"); // ROAS 10x, bem acima do equilíbrio de 3,6x

    const c = r.campaigns[0];
    expect(c).toMatchObject({ roas_target: 2, impression_share: 0.4, lost_by_budget: 0.25, lost_by_rank: 0.35, strategy: "PROFITABILITY" });
    expect(c.margin).toBeCloseTo(0.28); // margem dos produtos da campanha
    expect(c.suggestedRoas).toBe(5.5);
    expect(c.budgetUsage).toBeCloseTo(20 / 7 / 30);
    const codes = c.diagnoses.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["target_below_break_even", "budget_limited", "rank_limited"]));
    expect(c.diagnoses.find((d) => d.code === "budget_limited")?.suggest?.budget).toBe(50); // 30 × (0,4 + 0,25) / 0,4 = 48,75

    // Sugestões: MLBA1 já anunciado vendeu só 2 (não é campeão); MLBA2 fora de campanha e sem custo
    expect(r.suggestions.suggestions).toEqual([]);
    expect(r.suggestions.skipped.noCost).toBe(1);

    expect(await adsReport.buildAdsReport(B, accA)).toBeNull();
  });

  it("altera e cria campanhas só na conta do dono e guarda o histórico", async () => {
    // a campanha 5 da conta A veio da sincronização anterior
    expect(await adsData.ownCampaign(B, accA, 5)).toBeNull();
    const c = await adsData.ownCampaign(A, accA, 5);
    expect(c).toMatchObject({ id: 5, name: "Fones", advertiser_id: 9, site_id: "MLB" });

    await adsData.setCampaignField(B, accA, 5, "budget", 999); // não é dono: nada muda
    await adsData.setCampaignField(A, accA, 5, "budget", 45);
    await adsData.setCampaignField(A, accA, 5, "status", "paused");
    expect(await adsData.ownCampaign(A, accA, 5)).toMatchObject({ budget: 45, status: "paused" });

    await adsData.recordAdsChange(A, accA, { campaign_id: 5, campaign_name: "Fones", field: "budget", before_value: "30", after_value: "45", ok: true, error: null });
    await adsData.recordAdsChange(B, accA, { campaign_id: 5, campaign_name: "Fones", field: "budget", before_value: "45", after_value: "1", ok: true, error: null });
    const h = await adsData.adsChanges(A, accA);
    expect(h.changes).toHaveLength(1);
    expect(h.changes[0]).toMatchObject({ field: "budget", before_value: "30", after_value: "45", ok: true });
    expect(h.daily.length).toBeGreaterThan(0); // métricas diárias da campanha para medir o efeito
    expect((await adsData.adsChanges(B, accA)).changes).toEqual([]);

    await adsData.insertCreatedCampaign(B, accA, { id: 99, name: "Invasora", strategy: "PROFITABILITY", budget: 10, roasTarget: 3 });
    await adsData.insertCreatedCampaign(A, accA, { id: 98, name: "Seller Hub · Lançamentos", strategy: "VISIBILITY", budget: 10, roasTarget: 2.5 });
    const names = await adsData.campaignNames(A, accA);
    expect(names.has("Seller Hub · Lançamentos")).toBe(true);
    expect(names.has("Invasora")).toBe(false);
    expect((await adsData.campaignNames(B, accA)).size).toBe(0);
    expect(await adsData.ownAdvertiser(B, accA)).toBeNull();
    await db.query("delete from ads_campaigns where account_id = $1 and id = 98", [accA]);
  });

  it("registra sozinho as mudanças feitas no Mercado Ads", async () => {
    // estado salvo agora: orçamento 45, pausada, ROAS 2 (do teste anterior). No ML: 30, ativa, ROAS 2.
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/advertising/advertisers?product_id=PADS")) return respond({ advertisers: [{ advertiser_id: 9, site_id: "MLB" }] });
        if (u.includes("/product_ads/campaigns/5?")) return respond({ id: 5, roas_target: 2 });
        if (u.includes("/product_ads/campaigns")) return respond({ results: [{ id: 5, name: "Fones", status: "active", budget: 30 }] });
        if (u.includes("/product_ads/ads/search")) return respond({ results: [] });
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", changes: 2 });
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", changes: 0 }); // nada mudou de novo
    } finally {
      vi.unstubAllGlobals();
    }
    const h = await adsData.adsChanges(A, accA);
    const fromMl = h.changes.filter((c) => c.source === "mercado_ads").map((c) => [c.field, c.before_value, c.after_value]);
    expect(fromMl).toEqual(expect.arrayContaining([["budget", "45", "30"], ["status", "paused", "active"]]));
    expect(fromMl).toHaveLength(2);
    expect((await adsData.adsChanges(B, accA)).changes).toEqual([]);
  });

  it("segue sem as métricas de leilão quando a API recusa e o caminho antigo dá 404", async () => {
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = decodeURIComponent(String(url));
        if (u.includes("/advertising/advertisers?product_id=PADS")) return respond({ advertisers: [{ advertiser_id: 9, site_id: "MLB" }] });
        if (u.includes("/advertising/advertisers/9/product_ads/campaigns")) return respond({ message: "not found" }, 404); // caminho antigo
        if (u.includes("/product_ads/campaigns/search")) {
          if (u.includes("impression_share")) return respond({ message: "Field IMPRESSION_SHARE not allowed" }, 400);
          return respond({ results: [{ id: 5, name: "Fones", roas_target: 4, metrics: { cost: 10, total_amount: 60 } }] });
        }
        if (u.includes("/product_ads/campaigns/5?")) return respond({ message: "Field IMPRESSION_SHARE not allowed" }, 400);
        if (u.includes("/product_ads/ads/search")) return respond({ results: [] });
        if (u.includes("/product_ads/ad_groups/search")) return respond({ results: [] });
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", campaigns: 1, insights: 0, roasTargets: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lê os anúncios pelos grupos quando o caminho antigo foi desligado", async () => {
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/advertising/advertisers?product_id=PADS")) return respond({ advertisers: [{ advertiser_id: 9, site_id: "MLB" }] });
        if (u.includes("/product_ads/campaigns")) return respond({ results: [{ id: 5, name: "Fones", acos_target: 25 }] });
        if (u.includes("/product_ads/ads/search") || u.includes("/product_ads/ads?")) return respond({ message: "gone" }, 404);
        if (u.includes("/product_ads/ad_groups/search")) return respond({ results: [{ id: 77, campaign_id: 5 }] });
        if (u.includes("/product_ads/ad_groups/77/ads"))
          return respond({ results: [{ item_id: "MLBA1", status: "active", metrics: { clicks: 10, cost: 5, total_amount: 50 } }] });
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", items: 1, itemsSource: "ad_groups" });
    } finally {
      vi.unstubAllGlobals();
    }
    const [m] = await db.query<{ campaign_id: number; cost: number }>("select campaign_id, cost from ads_item_metrics where account_id = $1", [accA]);
    expect(m).toEqual({ campaign_id: 5, cost: 5 });
    const [c] = await db.query<{ roas_target: number }>("select roas_target from ads_campaigns where account_id = $1 and id = 5", [accA]);
    expect(c.roas_target).toBe(4); // só veio ACOS alvo de 25%: ROAS 4x
  });

  it("marca erro da publicidade sem derrubar nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "erro" });
    } finally {
      vi.unstubAllGlobals();
    }
    const [row] = await db.query<{ ads_status: string; ads_error: string }>("select ads_status, ads_error from ml_accounts where id = $1", [accA]);
    expect(row.ads_status).toBe("erro");
    expect(row.ads_error).toContain("403");
  });

  it("espião: categorias, catálogo e concorrentes, sem vazar para outro usuário", async () => {
    await db.query("update items set category_id = 'MLB1051', catalog_listing = true where id = 'MLBA1'");
    expect(await spyData.addCompetitor(A, accA, "MLBZ1", "item", "Loja Z")).toBe(true);
    expect(await spyData.addCompetitor(B, accA, "MLBZ2", "item", null)).toBe(false); // conta de outro usuário

    let competitorPrice = 100;
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/categories/MLB1051")) return respond({ id: "MLB1051", name: "Fones de Ouvido" });
        if (u.includes("/trends/MLB/MLB1051")) return respond([{ keyword: "fone bluetooth" }, { keyword: "fone sem fio" }]);
        if (u.includes("/highlights/MLB/category/MLB1051")) return respond({ content: [{ id: "MLBX1", position: 1, type: "ITEM" }] });
        if (u.includes("/items/MLBA1/price_to_win"))
          return respond({ status: "competing", current_price: 100, price_to_win: 95, winner: { item_id: "MLBX1", price: 95 }, reason: [] });
        if (u.includes("/items?ids=")) {
          const ids = new URL(u).searchParams.get("ids")!.split(",");
          return respond(ids.map((id) => ({ code: 200, body: { id, title: `Fone ${id} Bluetooth Sem Fio`, price: id === "MLBZ1" ? competitorPrice : 89.9, seller_id: 77, status: "active", shipping: { free_shipping: true } } })));
        }
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      const r1 = await spySync.syncSpy(accA);
      expect(r1).toMatchObject({ categories: 1, refreshed: 1, trends: 2, bestSellers: 1, catalog: 1, competitors: 1, errors: [] });
      // Dado público recente não é buscado de novo
      expect((await spySync.syncSpy(accA)).refreshed).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }

    expect((await spyData.trendsFor(["MLB1051"])).map((t) => t.keyword)).toEqual(["fone bluetooth", "fone sem fio"]);
    expect((await spyData.spyStatus(A, accA))?.spy_result).toMatchObject({ categories: 1, errors: [] });
    expect(await spyData.spyStatus(B, accA)).toBeNull();
    expect(await spyData.bestSellersFor(["MLB1051"])).toMatchObject([{ id: "MLBX1", price: 89.9, title: "Fone MLBX1 Bluetooth Sem Fio" }]);
    expect(await spyData.catalogFor(A, accA)).toMatchObject([{ item_id: "MLBA1", status: "competing", price_to_win: 95 }]);
    expect(await spyData.catalogFor(B, accA)).toEqual([]);
    expect(await spyData.competitorsFor(A, accA)).toMatchObject([{ item_id: "MLBZ1", note: "Loja Z", price: 100 }]);
    expect(await spyData.competitorsFor(B, accA)).toEqual([]);
    expect(await spyData.ownItem(B, accA, "MLBA1")).toBeNull();

    // Queda de preço do concorrente gera alerta (comparando com o dia anterior)
    await db.query("update competitor_snapshots set day = day - 1 where item_id = 'MLBZ1'");
    competitorPrice = 90;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/items?ids=")) return new Response(JSON.stringify([{ code: 200, body: { id: "MLBZ1", title: "Fone Z", price: competitorPrice, status: "active" } }]));
        if (u.includes("price_to_win")) return new Response(JSON.stringify({ status: "competing" }));
        return new Response("[]");
      }),
    );
    try {
      await spySync.syncSpy(accA);
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await data.recentEvents(accA)).some((e) => e.title === "Concorrente baixou o preço 10%")).toBe(true);

    await spyData.removeCompetitor(B, accA, "MLBZ1"); // não é dele: não remove
    expect(await spyData.competitorsFor(A, accA)).toHaveLength(1);
    await spyData.removeCompetitor(A, accA, "MLBZ1");
    expect(await spyData.competitorsFor(A, accA)).toHaveLength(0);
  });

  it("relatório semanal: período fechado contra o anterior, com publicidade e sem vazar", async () => {
    const week = periods.lastCompleteWeek(new Date());
    const prev = periods.previousPeriod(week);
    const at = (day: string, hour = 15) => new Date(new Date(`${day}T00:00:00Z`).getTime() + hour * 3600_000).toISOString();
    const mid = (p: { start: string }, plus: number) => new Date(new Date(`${p.start}T00:00:00Z`).getTime() + plus * 86400_000).toISOString().slice(0, 10);
    const api = { shipmentCosts: vi.fn(async () => ({ senders: [{ user_id: 1, cost: 0 }] })) };
    const order = (id: number, date: string, item: string, qty: number, price: number) =>
      store.upsertOrder(api as never, accA, 1, {
        id,
        status: "paid",
        date_created: date,
        total_amount: qty * price,
        shipping: { id: null },
        order_items: [{ item: { id: item, title: item }, quantity: qty, unit_price: price, sale_fee: 0 }],
      });
    await order(7001, at(mid(week, 2)), "MLBA1", 3, 100); // esta semana: 300
    await order(7002, at(mid(week, 6), 23), "MLBA2", 1, 100); // domingo 23h UTC (20h em Brasília): ainda é desta semana
    await order(7003, at(mid(prev, 3)), "MLBA1", 1, 100); // semana anterior: 100
    await order(7004, at(mid(week, 7), 4), "MLBA1", 9, 100); // segunda 01h em Brasília: fora
    await db.query(
      `insert into ads_campaign_daily (account_id, campaign_id, day, clicks, prints, cost, revenue, units) values
       ($1, 99, $2, 10, 100, 40, 200, 2), ($1, 99, $3, 5, 50, 10, 0, 0)`,
      [accA, mid(week, 1), mid(prev, 1)],
    );

    const { data } = await periodReport.buildPeriodReport(accA, A, week);
    expect(data.period).toEqual(week);
    expect(data.totals).toMatchObject({ revenue: 400, orders: 2, units: 4, avgTicket: 200, adCost: 40, adRevenue: 200 });
    expect(data.totals.acos).toBeCloseTo(0.2);
    expect(data.totals.tacos).toBeCloseTo(0.1);
    expect(data.totals.profitAfterAds).toBeCloseTo(data.totals.profit - 40);
    expect(data.previous).toMatchObject({ revenue: 100, orders: 1, adCost: 10 });
    expect(data.daily).toHaveLength(7);
    expect(data.daily[0].day).toBe(week.start);
    expect(data.daily.reduce((a, d) => a + d.revenue, 0)).toBe(400);
    expect(data.topProducts[0]).toMatchObject({ itemId: "MLBA1", revenue: 300, units: 3 });
    expect(data.movers.up[0]).toMatchObject({ itemId: "MLBA1", revenue: 300, prevRevenue: 100 });

    // Gera e grava; a IA sem chave falha e o relatório sai mesmo assim
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    try {
      expect(await periodReport.ensureDueReports(accA, A, [week])).toHaveLength(1);
      expect(await periodReport.ensureDueReports(accA, A, [week])).toHaveLength(0); // já existe: não refaz
    } finally {
      vi.unstubAllGlobals();
    }
    const saved = await reportsData.getReport(A, accA, "weekly", week.start);
    expect(saved?.data.totals.revenue).toBe(400);
    expect(saved?.ai).toBeNull();
    expect(await reportsData.getReport(B, accA, "weekly", week.start)).toBeNull();
    expect(await reportsData.listReports(B, accA)).toEqual([]);
    expect(await reportsData.listReports(A, accA)).toHaveLength(1);
  });

  it("lista os pedidos com produtos e custos só para o dono da conta", async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 86_400_000);
    const to = new Date(now.getTime() + 60_000);
    const mine = await sales.ordersWithLines(A, accA, from, to);
    const o = mine.find((x) => x.id === "9001"); // id do pedido é texto (a Shopee usa letras)
    expect(o).toMatchObject({ status: "paid", shipping_cost: 20 });
    expect(o?.lines).toEqual([
      { item_id: "MLBA1", title: "MLBA1", thumbnail: null, quantity: 2, unit_price: 100, sale_fee: 14, unit_cost: 40, extra_cost: 2 },
    ]);
    expect(await sales.ordersWithLines(B, accA, from, to)).toEqual([]);
    expect(await sales.ordersWithLines(A, accA, to, new Date(to.getTime() + 60_000))).toEqual([]);
  });

  it("manda o relatório no WhatsApp só para o dono e registra o resultado", async () => {
    const [{ kind, period_start: start }] = await reportsData.listReports(A, accA);
    expect(await delivery.deliverReport(accA, A, kind, start)).toBe("not-configured");

    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "999";
    const sent: { url: string; body: { to: string; template: { components: { parameters: { text: string }[] }[] } } }[] = [];
    try {
      expect(await delivery.deliverReport(accA, A, kind, start)).toBe("no-phone");
      expect(await reportsData.reportsToDeliver(accA)).toHaveLength(1);

      const settings = await data.settingsOf(A);
      await data.saveSettings({ ...settings, whatsapp_phone: "5511987654321" });
      expect((await data.settingsOf(A)).whatsapp_phone).toBe("5511987654321");
      // B não dispara o relatório da conta de A
      expect(await delivery.deliverReport(accA, B, kind, start)).toBe("no-report");

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          sent.push({ url, body: JSON.parse(String(init.body)) });
          return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
        }),
      );
      expect(await delivery.deliverReport(accA, A, kind, start)).toBe("sent");
      expect(sent[0].url).toContain("/999/messages");
      expect(sent[0].body.to).toBe("5511987654321");
      expect(sent[0].body.template.components[0].parameters).toHaveLength(7);
      expect(sent[0].body.template.components[1].parameters[0].text).toBe(`${kind}-${start}`);
      expect((await reportsData.getReport(A, accA, kind, start))?.whatsapp_sent_at).not.toBeNull();
      expect(await reportsData.reportsToDeliver(accA)).toEqual([]);

      // Falha fica registrada e o cron tenta de novo
      await db.query("update reports set whatsapp_sent_at = null where account_id = $1", [accA]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 132001, message: "x" } }), { status: 404 })));
      expect(await delivery.deliverPendingReports(accA, A)).toEqual({ failed: 1 });
      const failed = await reportsData.getReport(A, accA, kind, start);
      expect(failed?.whatsapp_sent_at).toBeNull();
      expect(failed?.whatsapp_error).toContain("modelo");
      expect(await reportsData.reportsToDeliver(accA)).toHaveLength(1);
      expect(await reportsData.reportsToDeliver(accB)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.WHATSAPP_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
  });

  it("busca o histórico de pedidos aos poucos e retoma de onde parou", async () => {
    const DAY = 86_400_000;
    const now = new Date("2030-06-30T12:00:00Z");
    // um pedido a cada 10 dias, de 0 a 150 dias atrás
    const all = Array.from({ length: 16 }, (_, i) => ({
      id: 900000 + i,
      status: "paid",
      date_created: new Date(now.getTime() - i * 10 * DAY - 3600_000).toISOString(),
      total_amount: 10,
      shipping: { id: null },
      order_items: [{ item: { id: "MLBA2", title: "x" }, quantity: 1, unit_price: 10, sale_fee: 0 }],
    }));
    const calls: [string, string][] = [];
    const api = {
      shipmentCosts: vi.fn(),
      ordersBetween: vi.fn(async (_s: number, from: Date, to?: Date) => {
        calls.push([from.toISOString(), to!.toISOString()]);
        return all.filter((o) => new Date(o.date_created) >= from && new Date(o.date_created) < to!);
      }),
    };
    const start = new Date(now.getTime() - 30 * DAY);
    const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from orders where id::bigint >= 900000"))[0].n;

    // Sem tempo: não busca nada e não perde o ponto de partida
    expect(await backfill.backfillOrders(api, accA, 1, start, { now, deadline: Date.now() - 1 })).toEqual(start);

    // Com tempo: recua em blocos de 30 dias até 120 dias
    const reached = await backfill.backfillOrders(api, accA, 1, start, { now, deadline: Date.now() + 60_000 });
    expect(reached.toISOString()).toBe(new Date(now.getTime() - 120 * DAY).toISOString());
    expect(calls).toHaveLength(3);
    expect(await count()).toBe(9); // pedidos de 30 a 110 dias atrás (os de 120+ ficam de fora)
    const [row] = await db.query<{ orders_history_since: string }>("select orders_history_since from ml_accounts where id = $1", [accA]);
    expect(row.orders_history_since).toBe(reached.toISOString());

    // Já completo: não chama a API de novo
    calls.length = 0;
    await backfill.backfillOrders(api, accA, 1, reached, { now, deadline: Date.now() + 60_000 });
    expect(calls).toHaveLength(0);
    await db.query("delete from orders where id::bigint >= 900000");
  });

  it("perguntas: pendentes, rascunho e resposta só do próprio vendedor", async () => {
    const at = new Date().toISOString();
    await store.upsertQuestion(accA, { id: 501, item_id: "MLBA1", text: "Funciona com Android?", status: "UNANSWERED", date_created: at });
    await store.upsertQuestion(accA, { id: 502, item_id: "MLBA1", text: "Tem nota?", status: "ANSWERED", date_created: at, answer: { text: "Sim, enviamos nota fiscal." } });
    const pending = await questionsData.pendingQuestions(A, accA);
    expect(pending.map((q) => q.id)).toContain(501);
    expect(pending.find((q) => q.id === 501)).toMatchObject({ title: "MLBA1", draft: null });
    expect(await questionsData.pendingQuestions(B, accA)).toEqual([]);
    expect(await questionsData.ownPendingQuestion(B, accA, 501)).toBeNull();
    expect(await questionsData.ownPendingQuestion(A, accA, 502)).toBeNull(); // já respondida
    expect(await questionsData.ownPendingQuestion(A, accA, 501)).toMatchObject({ id: 501, text: "Funciona com Android?", draft: null });
    expect(await questionsData.pastAnswers(accA, "MLBA1")).toContainEqual({ question: "Tem nota?", answer: "Sim, enviamos nota fiscal." });

    await questionsData.saveDraft(accA, 501, { answer: "Olá! Sim.", confidence: "alta", missing: [] });
    expect((await questionsData.pendingQuestions(A, accA)).find((q) => q.id === 501)?.draft).toEqual({ answer: "Olá! Sim.", confidence: "alta", missing: [] });
    await questionsData.markAnswered(accA, 501, "Olá! Sim, funciona.");
    expect((await questionsData.pendingQuestions(A, accA)).some((q) => q.id === 501)).toBe(false);
    expect((await questionsData.recentlyAnswered(A, accA))[0]).toMatchObject({ id: 501, answer: "Olá! Sim, funciona." });
    expect(await questionsData.recentlyAnswered(B, accA)).toEqual([]);

    await data.saveSettings({ ...(await data.settingsOf(A)), store_info: "Enviamos em 24h." });
    expect((await data.settingsOf(A)).store_info).toBe("Enviamos em 24h.");
  });

  it("sincronização completa: reaproveita visitas recentes e registra o resumo", async () => {
    await tokens.saveTokens(accA, { access_token: "tok", refresh_token: "r", expires_in: 21600, user_id: 1 });
    await db.query("update ml_accounts set orders_history_since = now() - interval '200 days', visits_synced_at = null where id = $1", [accA]);
    await store.upsertQuestion(accA, { id: 777, item_id: "MLBA1", text: "x", status: "UNANSWERED", date_created: new Date().toISOString() });
    const visitCalls: string[] = [];
    const respond = (body: unknown) => new Response(JSON.stringify(body));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/users/1/items/search")) return respond({ results: ["MLBA1", "MLBA2"], scroll_id: null });
        if (u.match(/\/users\/1$/)) return respond({ id: 1, nickname: "loja_a", site_id: "MLB", seller_reputation: { level_id: "5_green" } });
        if (u.includes("/items?ids="))
          return respond(["MLBA1", "MLBA2"].map((id) => ({ code: 200, body: { id, title: id, price: 100, available_quantity: 10, sold_quantity: 1, status: "active" } })));
        if (u.includes("/visits/time_window")) {
          visitCalls.push(u);
          return respond({ results: [{ date: new Date().toISOString(), total: 7 }] });
        }
        if (u.includes("/orders/search")) return respond({ results: [], paging: { total: 0 } });
        if (u.includes("/questions/search")) return respond({ questions: [] });
        if (u.includes("/questions/777")) return respond({ id: 777, item_id: "MLBA1", text: "x", status: "ANSWERED", date_created: new Date().toISOString(), answer: { text: "respondida no app" } });
        if (u.includes("/advertising/advertisers")) return respond({ advertisers: [] });
        return respond([]);
      }),
    );
    try {
      const r1 = await sync.syncAccount(accA);
      expect(r1.visits).toEqual({ fetched: 2, failed: 0, reused: false });
      expect(r1.historySince).not.toBeNull();
      const r2 = await sync.syncAccount(accA);
      expect(r2.visits.reused).toBe(true);
      expect(visitCalls).toHaveLength(2); // a segunda rodada não chamou de novo
    } finally {
      vi.unstubAllGlobals();
    }
    const [row] = await db.query<{ last_sync_result: { items: number } }>("select last_sync_result from ml_accounts where id = $1", [accA]);
    expect(row.last_sync_result.items).toBe(2);
    const [q] = await db.query<{ status: string; answer: string }>("select status, answer from questions where id = 777");
    expect(q).toEqual({ status: "ANSWERED", answer: "respondida no app" });
  });

  it("aceita conta da Shopee com o mesmo número de uma conta do ML e pedidos com código de letras", async () => {
    // loja Shopee com shop_id = 1, igual ao user_id da conta ML de A
    const [shop] = await db.query<{ id: string }>(
      "insert into ml_accounts (owner_id, marketplace, ml_user_id, nickname, site_id) values ($1, 'shopee', 1, 'loja_shopee', 'BR') returning id",
      [A],
    );
    expect((await data.accountByMlUser(1))?.id).toBe(accA); // webhooks do ML continuam achando a conta do ML
    const mine = await data.accountsOf(A);
    expect(mine.map((a) => a.marketplace).sort()).toEqual(["mercadolivre", "shopee"]);
    expect(mine.find((a) => a.marketplace === "shopee")?.connected).toBe(false);
    await db.query("insert into shopee_tokens (account_id, access_token, refresh_token, expires_at, refresh_expires_at) values ($1, 'a', 'r', now(), now())", [shop.id]);
    expect((await data.accountsOf(A)).find((a) => a.marketplace === "shopee")?.connected).toBe(true);
    expect(await data.accountsOf(B)).toHaveLength(1);

    await db.query(
      "insert into orders (id, account_id, status, date_created, total_amount) values ('2610280ABCDXYZ', $1, 'paid', now(), 50)",
      [shop.id],
    );
    const lines = await sales.ordersWithLines(A, shop.id, new Date(Date.now() - 3_600_000), new Date(Date.now() + 60_000));
    expect(lines.map((o) => o.id)).toEqual(["2610280ABCDXYZ"]);
    await db.query("delete from ml_accounts where id = $1", [shop.id]);
  });

  it("sincroniza a loja da Shopee: anúncios, variações, pedidos e taxas", async () => {
    process.env.SHOPEE_PARTNER_ID = "2001887";
    process.env.SHOPEE_PARTNER_KEY = "chave";
    const shop = (await data.linkShopeeShop(A, { id: 777, name: "loja_shp" }))!;
    expect(await data.linkShopeeShop(B, { id: 777, name: "invasor" })).toBeNull(); // loja de outro usuário
    await shopeeTokens.saveShopeeTokens(shop.id, { access_token: "tok", refresh_token: "ref", expire_in: 14400 });

    const now = Math.floor(Date.now() / 1000);
    const paths: string[] = [];
    const reply = (response: unknown) => new Response(JSON.stringify({ error: "", message: "", response }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        paths.push(u.pathname);
        expect(u.searchParams.get("shop_id")).toBe("777");
        switch (u.pathname) {
          case "/api/v2/product/get_item_list":
            return reply({ item: [{ item_id: 1 }, { item_id: 2 }], has_next_page: false });
          case "/api/v2/product/get_item_base_info":
            return reply({
              item_list: [
                { item_id: 1, item_name: "Caneca", item_status: "NORMAL", price_info: [{ current_price: 40 }], stock_info_v2: { summary_info: { total_available_stock: 5 } } },
                { item_id: 2, item_name: "Almofada", item_status: "NORMAL", has_model: true },
              ],
            });
          case "/api/v2/product/get_model_list":
            return reply({
              model: [
                { price_info: [{ current_price: 35 }], stock_info_v2: { summary_info: { total_available_stock: 2 } } },
                { price_info: [{ current_price: 30 }], stock_info_v2: { summary_info: { total_available_stock: 3 } } },
              ],
            });
          case "/api/v2/order/get_order_list":
            return reply({ order_list: [{ order_sn: "SN1" }, { order_sn: "SN2" }], more: false });
          case "/api/v2/order/get_order_detail":
            return reply({
              order_list: [
                { order_sn: "SN1", order_status: "COMPLETED", create_time: now - 3600, total_amount: 80, item_list: [{ item_id: 1, item_name: "Caneca", model_quantity_purchased: 2, model_discounted_price: 40 }] },
                { order_sn: "SN2", order_status: "CANCELLED", create_time: now - 7200, total_amount: 30, item_list: [{ item_id: 2, item_name: "Almofada", model_quantity_purchased: 1, model_discounted_price: 30 }] },
              ],
            });
          case "/api/v2/payment/get_escrow_detail":
            return reply({ order_income: { commission_fee: 12, service_fee: 4, seller_transaction_fee: 0, actual_shipping_fee: 10, shopee_shipping_rebate: 10 } });
          case "/api/v2/shop/get_shop_info":
            return reply({ shop_name: "Ateliê na Shopee" });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    try {
      expect(await shopeeSync.syncShopee(shop.id)).toMatchObject({ items: 2, orders: 2, newOrders: 2, escrows: 1 });
      paths.length = 0;
      expect(await shopeeSync.syncShopee(shop.id)).toMatchObject({ orders: 2, newOrders: 0, escrows: 0 }); // nada novo: sem extrato de novo
      expect(paths).not.toContain("/api/v2/payment/get_escrow_detail");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.SHOPEE_PARTNER_ID;
      delete process.env.SHOPEE_PARTNER_KEY;
    }

    const items = await db.query<{ id: string; price: number; available_quantity: number }>(
      "select id, price, available_quantity from items where account_id = $1 order by id",
      [shop.id],
    );
    expect(items).toEqual([
      { id: "SHP1", price: 40, available_quantity: 5 },
      { id: "SHP2", price: 30, available_quantity: 5 }, // variações: menor preço, estoque somado
    ]);
    const [sn1] = await db.query<{ status: string; shipping_cost: number }>("select status, shipping_cost from orders where id = 'SN1'");
    expect(sn1).toEqual({ status: "paid", shipping_cost: 0 });
    const [line] = await db.query<{ sale_fee: number }>("select sale_fee from order_items where order_id = 'SN1'");
    expect(line.sale_fee).toBe(8); // 16 de taxas em 2 unidades
    expect((await db.query("select 1 from orders where id = 'SN2' and status = 'cancelled'")).length).toBe(1);
    const events = (await data.recentEvents(shop.id)).map((e) => e.title);
    expect(events).toHaveLength(1); // só a venda paga; a cancelada não vira "nova venda"
    expect(events[0]).toMatch(/^Nova venda na Shopee: R\$\s80,00$/);
    expect((await data.accountById(shop.id))?.nickname).toBe("Ateliê na Shopee");

    const r = await report.buildReport(shop.id, A, 7);
    expect(r.totals).toMatchObject({ revenue: 80, orders: 1, fees: 16 });
    await db.query("delete from ml_accounts where id = $1", [shop.id]);
  });

  it("sincroniza a conta da Amazon: relatório de anúncios, pedidos e taxas do extrato", async () => {
    process.env.AMAZON_APP_ID = "amzn1.sp.solution.x";
    process.env.AMAZON_LWA_CLIENT_ID = "cli";
    process.env.AMAZON_LWA_CLIENT_SECRET = "seg";
    const acc = (await data.linkAmazonSeller(A, { id: "A1SELLER", name: null }))!;
    expect(acc).toMatchObject({ marketplace: "amazon", external_id: "A1SELLER", ml_user_id: null });
    expect(await data.linkAmazonSeller(B, { id: "A1SELLER", name: "invasor" })).toBeNull(); // conta de outro usuário
    expect((await data.accountsOf(A)).find((a) => a.id === acc.id)?.connected).toBe(false);
    await amazonTokens.saveAmazonTokens(acc.id, { access_token: "tok", refresh_token: "ref", expires_in: 3600 });
    expect((await data.accountsOf(A)).find((a) => a.id === acc.id)?.connected).toBe(true);
    const stored = await db.one<{ access_token: string; refresh_token: string }>("select access_token, refresh_token from amazon_tokens where account_id = $1", [acc.id]);
    expect(stored?.refresh_token).not.toBe("ref"); // criptografado

    const created = new Date(Date.now() - 3600_000).toISOString();
    const paths: string[] = [];
    const tsv = "item-name\tseller-sku\tprice\tquantity\tasin1\tfulfillment-channel\tstatus\nCaneca\tCAN-1\t49.90\t7\tB0A\tDEFAULT\tActive\n";
    const order = (orderId: string, status: string, sku: string, qty: number, amount: string) => ({
      orderId,
      createdTime: created,
      fulfillment: { fulfillmentStatus: status },
      orderItems: [{ product: { asin: "B0A", sellerSku: sku }, quantityOrdered: qty, proceeds: { breakdowns: [{ type: "ITEM", subtotal: { amount, currencyCode: "BRL" } }] } }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const u = new URL(String(url));
        paths.push(u.pathname);
        if (u.hostname === "docs.example") return new Response(tsv, { headers: { "content-type": "text/plain; charset=UTF-8" } });
        expect(new Headers(init?.headers).get("x-amz-access-token")).toBe("tok");
        const json = (body: unknown) => new Response(JSON.stringify(body));
        switch (u.pathname) {
          case "/reports/2021-06-30/reports":
            return json({ reportId: "R1" });
          case "/reports/2021-06-30/reports/R1":
            return json({ reportId: "R1", processingStatus: "DONE", reportDocumentId: "D1" });
          case "/reports/2021-06-30/documents/D1":
            return json({ url: "https://docs.example/d1" });
          case "/orders/2026-01-01/orders":
            expect(u.searchParams.get("marketplaceIds")).toBe("A2Q3Y263D00KWC");
            if (u.searchParams.get("lastUpdatedAfter")) return json({ orders: [order("701-1", "Shipped", "CAN-1", 2, "99.80"), order("701-2", "Canceled", "CAN-1", 1, "49.90")] });
            return json({ orders: [] });
          case "/finances/v0/orders/701-1/financialEvents":
            return json({ payload: { FinancialEvents: { ShipmentEventList: [{ ShipmentItemList: [{ SellerSKU: "CAN-1", ItemFeeList: [{ FeeType: "Commission", FeeAmount: { CurrencyAmount: -15 } }] }] }] } } });
          case "/sellers/v1/marketplaceParticipations":
            return json({ payload: [{ marketplace: { id: "A2Q3Y263D00KWC" }, storeName: "Ateliê na Amazon" }] });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    try {
      expect(await amazonSync.syncAmazon(acc.id)).toMatchObject({ items: 1, orders: 2, newOrders: 2, fees: 1 });
      paths.length = 0;
      expect(await amazonSync.syncAmazon(acc.id)).toMatchObject({ orders: 2, newOrders: 0, fees: 0 }); // taxa já gravada: sem extrato de novo
      expect(paths.some((p) => p.startsWith("/finances"))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.AMAZON_APP_ID;
      delete process.env.AMAZON_LWA_CLIENT_ID;
      delete process.env.AMAZON_LWA_CLIENT_SECRET;
    }

    const items = await db.query<{ id: string; price: number; available_quantity: number; status: string }>(
      "select id, price, available_quantity, status from items where account_id = $1",
      [acc.id],
    );
    expect(items).toEqual([{ id: "AMZCAN-1", price: 49.9, available_quantity: 7, status: "active" }]);
    const [line] = await db.query<{ sale_fee: number; unit_price: number }>("select sale_fee, unit_price from order_items where order_id = '701-1'");
    expect(line).toEqual({ sale_fee: 7.5, unit_price: 49.9 });
    expect((await db.query("select 1 from orders where id = '701-2' and status = 'cancelled'")).length).toBe(1);
    const events = (await data.recentEvents(acc.id)).map((e) => e.title);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/^Nova venda na Amazon: R\$\s99,80$/);
    expect((await data.accountById(acc.id))?.nickname).toBe("Ateliê na Amazon");
    expect(await data.accountsOf(B)).not.toContainEqual(expect.objectContaining({ id: acc.id }));

    const r = await report.buildReport(acc.id, A, 7);
    expect(r.totals).toMatchObject({ revenue: 99.8, orders: 1, fees: 15 });
    await db.query("delete from ml_accounts where id = $1", [acc.id]);
  });

  it("equipe: convite só para o e-mail convidado, uma vez, e acesso só às lojas de quem convidou", async () => {
    const a = { id: A, email: "a@x.com" };
    const b = { id: B, email: "b@x.com" };
    const token = await team.createInvite(A, " B@X.com ", "operador");
    expect((await team.pendingInvites(A)).map((i) => [i.email, i.role])).toEqual([["b@x.com", "operador"]]);
    expect(await team.pendingInvites(B)).toEqual([]);
    expect(await team.inviteByToken(token)).toMatchObject({ owner_email: "a@x.com", email: "b@x.com", role: "operador" });
    expect(await team.inviteByToken("codigo-inventado")).toBeNull();

    expect((await team.acceptInvite(token, a)).result).toBe("outro-email"); // o próprio dono não aceita
    expect((await team.acceptInvite("codigo-inventado", b)).result).toBe("invalido");
    expect(await team.acceptInvite(token, b)).toEqual({ result: "ok", ownerId: A });
    expect((await team.acceptInvite(token, b)).result).toBe("usado");
    expect(await team.pendingInvites(A)).toEqual([]);

    expect(await team.membershipsOf(B)).toEqual([{ owner_id: A, role: "operador", owner_email: "a@x.com" }]);
    expect(await team.membershipsOf(A)).toEqual([]);
    expect((await team.teamOf(A)).map((m) => [m.email, m.role])).toEqual([["b@x.com", "operador"]]);
    // B vê as próprias lojas e as de A; A continua vendo só as dele
    const ids = (await data.accountsOfOwners([B, A])).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([accA, accB]));
    expect((await data.accountsOfOwners([A])).map((x) => x.id)).not.toContain(accB);

    await team.setMemberRole(B, B, "gerente"); // B não é dono de equipe nenhuma: nada muda
    await team.setMemberRole(A, B, "gerente");
    expect((await team.membershipsOf(B))[0].role).toBe("gerente");

    // convite vencido e cancelado
    const old = await team.createInvite(A, "c@x.com", "leitura");
    await db.query("update team_invites set expires_at = now() - interval '1 minute' where email = 'c@x.com'");
    expect((await team.acceptInvite(old, { id: "user-c", email: "c@x.com" })).result).toBe("expirado");
    const revoked = await team.createInvite(A, "d@x.com", "leitura");
    const [{ token_hash }] = await team.pendingInvites(A);
    await team.revokeInvite(B, token_hash); // só o dono cancela
    expect(await team.pendingInvites(A)).toHaveLength(1);
    await team.revokeInvite(A, token_hash);
    expect((await team.acceptInvite(revoked, { id: "user-d", email: "d@x.com" })).result).toBe("invalido");

    await team.removeMember(B, B); // ninguém se remove da equipe dos outros pelo lado errado
    expect(await team.membershipsOf(B)).toHaveLength(1);
    await team.removeMember(A, B);
    expect(await team.membershipsOf(B)).toEqual([]);
  });

  it("cadastra e autentica usuários pelo Better Auth", async () => {
    await auth.auth.api.signUpEmail({ body: { email: "c@x.com", password: "senha-segura-1!", name: "c" } });
    const res = await auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "senha-segura-1!" } });
    expect("user" in res && res.user.email).toBe("c@x.com");
    await expect(auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "errada-123" } })).rejects.toThrow();
    // senha curta (regra antiga de 8) não passa mais
    await expect(auth.auth.api.signUpEmail({ body: { email: "d@x.com", password: "curta-12", name: "d" } })).rejects.toThrow();
  });

  it("segurança: senha trocada fica registrada e o login com duas etapas exige o código", async () => {
    const { createOTP } = await import("@better-auth/utils/otp");
    const { base32 } = await import("@better-auth/utils/base32");
    const { markPasswordChanged } = await import("@/lib/data/security");
    const { pendingSecurityStep } = await import("@/lib/analytics/security");
    const api = auth.auth.api;
    const cookieOf = (h: Headers) =>
      h
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .filter((c) => !c.endsWith("="))
        .join("; ");
    const email = "e@x.com";
    const password = "Ateliê-Toque-2026";

    const signup = await api.signUpEmail({ body: { email, password, name: "e" }, returnHeaders: true });
    let cookie = cookieOf(signup.headers);
    const now = new Date();
    let session = await api.getSession({ headers: new Headers({ cookie }) });
    expect(pendingSecurityStep(session!.user, now)).toBe("senha"); // sem data: troca obrigatória
    await markPasswordChanged(session!.user.id);
    session = await api.getSession({ headers: new Headers({ cookie }) });
    expect(new Date(session!.user.passwordChangedAt!).getTime()).toBeGreaterThan(now.getTime() - 60_000);
    expect(pendingSecurityStep(session!.user, now)).toBe("duas-etapas");

    await expect(api.enableTwoFactor({ body: { password: "errada", method: "totp" }, headers: new Headers({ cookie }) })).rejects.toThrow();
    const enabled = await api.enableTwoFactor({ body: { password, method: "totp" }, headers: new Headers({ cookie }) });
    if (enabled.method !== "totp") throw new Error("esperava totp");
    expect(enabled.backupCodes.length).toBeGreaterThan(5);
    const secret = new TextDecoder().decode(base32.decode(new URL(enabled.totpURI).searchParams.get("secret")!));
    const otp = createOTP(secret);
    // Antes de confirmar o primeiro código, o login ainda não pede a segunda etapa.
    expect("twoFactorRedirect" in (await api.signInEmail({ body: { email, password } }))).toBe(false);
    const confirmed = await api.verifyTOTP({ body: { code: await otp.totp() }, headers: new Headers({ cookie }), returnHeaders: true });
    cookie = cookieOf(confirmed.headers);
    session = await api.getSession({ headers: new Headers({ cookie }) });
    expect(session!.user.twoFactorEnabled).toBe(true);
    expect(pendingSecurityStep(session!.user, now)).toBeNull();

    // Login: senha certa não cria sessão sozinha
    const first = await api.signInEmail({ body: { email, password }, returnHeaders: true });
    expect(first.response).toMatchObject({ twoFactorRedirect: true });
    const pending = cookieOf(first.headers);
    expect(await api.getSession({ headers: new Headers({ cookie: pending }) })).toBeNull();
    await expect(api.verifyTOTP({ body: { code: "000000" }, headers: new Headers({ cookie: pending }) })).rejects.toThrow();
    const ok = await api.verifyTOTP({ body: { code: await otp.totp() }, headers: new Headers({ cookie: pending }), returnHeaders: true });
    expect((await api.getSession({ headers: new Headers({ cookie: cookieOf(ok.headers) }) }))?.user.email).toBe(email);

    // Código de recuperação também entra, uma vez só
    const again = cookieOf((await api.signInEmail({ body: { email, password }, returnHeaders: true })).headers);
    await api.verifyBackupCode({ body: { code: enabled.backupCodes[0] }, headers: new Headers({ cookie: again }) });
    const third = cookieOf((await api.signInEmail({ body: { email, password }, returnHeaders: true })).headers);
    await expect(api.verifyBackupCode({ body: { code: enabled.backupCodes[0] }, headers: new Headers({ cookie: third }) })).rejects.toThrow();
  });
});
