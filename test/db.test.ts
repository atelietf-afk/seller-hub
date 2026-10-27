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

    const today = new Date().toISOString().slice(0, 10);
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
        if (u.includes("/product_ads/campaigns")) {
          if (u.includes("aggregation_type=DAILY")) return respond({ results: [{ campaign_id: 5, date: today, cost: 20, total_amount: 200 }] });
          return respond({ results: [{ id: 5, name: "Fones", status: "active", budget: 30, acos_target: 10, metrics: { clicks: 40, prints: 4000, cost: 20, total_amount: 200, units_quantity: 2 } }] });
        }
        if (u.includes("/product_ads/ads/search"))
          return respond({ results: [{ item_id: "MLBA1", campaign_id: 5, metrics: { clicks: 40, prints: 4000, cost: 20, total_amount: 200, units_quantity: 2 } }] });
        return respond({ message: "inesperado " + u }, 500);
      }),
    );
    try {
      expect(await adsSync.syncAds(accA)).toMatchObject({ status: "ok", campaigns: 1, dailyRows: 1, items: 1 });
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

    expect(await adsReport.buildAdsReport(B, accA)).toBeNull();
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
      expect(r1).toMatchObject({ categories: 1, refreshed: 1, catalog: 1, competitors: 1, errors: [] });
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

  it("cadastra e autentica usuários pelo Better Auth", async () => {
    await auth.auth.api.signUpEmail({ body: { email: "c@x.com", password: "senha-segura-1", name: "c" } });
    const res = await auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "senha-segura-1" } });
    expect(res.user.email).toBe("c@x.com");
    await expect(auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "errada-123" } })).rejects.toThrow();
  });
});
