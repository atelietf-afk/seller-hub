// Testes contra um Postgres de verdade. Rodam só com TEST_DATABASE_URL definido
// (o banco é apagado e recriado a cada execução — nunca aponte para produção).
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("banco de dados", () => {
  let db: typeof import("@/lib/db");
  let data: typeof import("@/lib/data/accounts");
  let store: typeof import("@/lib/ml/store");
  let tokens: typeof import("@/lib/ml/tokens");
  let report: typeof import("@/lib/report");
  let auth: typeof import("@/lib/auth");
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

    await db.query("drop schema public cascade; create schema public;");
    await db.query(await readFile(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8"));
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

  it("cadastra e autentica usuários pelo Better Auth", async () => {
    await auth.auth.api.signUpEmail({ body: { email: "c@x.com", password: "senha-segura-1", name: "c" } });
    const res = await auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "senha-segura-1" } });
    expect(res.user.email).toBe("c@x.com");
    await expect(auth.auth.api.signInEmail({ body: { email: "c@x.com", password: "errada-123" } })).rejects.toThrow();
  });
});
