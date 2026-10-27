import { describe, expect, it } from "vitest";
import { todaySales, todayWindow, type SaleOrder } from "@/lib/analytics/today";

// 27/10/2026 15:00 em Brasília = 18:00 UTC
const now = new Date("2026-10-27T18:00:00Z");

const order = (id: number, iso: string, o: Partial<SaleOrder> = {}, cost: number | null = 40): SaleOrder => ({
  id,
  status: "paid",
  date_created: iso,
  shipping_cost: 10,
  lines: [{ item_id: "MLB1", title: "Caneca", thumbnail: null, quantity: 2, unit_price: 50, sale_fee: 7, unit_cost: cost, extra_cost: 0 }],
  ...o,
});

describe("todayWindow", () => {
  it("vai da meia-noite de ontem (Brasília) até agora", () => {
    const w = todayWindow(now);
    expect(w.todayStart.toISOString()).toBe("2026-10-27T03:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(w.to).toBe(now);
  });
});

describe("todaySales", () => {
  it("soma as vendas pagas de hoje e lista os pedidos do mais novo para o mais antigo", () => {
    const r = todaySales(
      [
        order(1, "2026-10-27T12:00:00Z"),
        order(2, "2026-10-27T17:30:00Z"),
        order(3, "2026-10-27T16:00:00Z", { status: "cancelled" }),
      ],
      0.06,
      now,
    );
    expect(r.day).toBe("2026-10-27");
    // por pedido: 100 − 14 comissão − 10 frete − 6 imposto − 80 custo = −10
    expect(r.today).toMatchObject({ revenue: 200, orders: 2, units: 4, profit: -20, avgTicket: 100, hasCost: true });
    expect(r.orders.map((o) => o.id)).toEqual([2, 3, 1]);
    expect(r.orders[1]).toMatchObject({ status: "cancelled", counted: false });
    expect(r.orders[0].lines[0]).toEqual({ itemId: "MLB1", title: "Caneca", thumbnail: null, quantity: 2 });
  });

  it("compara com ontem só até o mesmo horário", () => {
    const r = todaySales(
      [
        order(1, "2026-10-27T12:00:00Z"),
        order(10, "2026-10-26T04:00:00Z"), // ontem 1h
        order(11, "2026-10-26T17:59:00Z"), // ontem 14h59: entra
        order(12, "2026-10-26T20:00:00Z"), // ontem 17h: depois do horário de agora
        order(13, "2026-10-26T02:00:00Z"), // anteontem 23h
      ],
      0,
      now,
    );
    expect(r.yesterday.orders).toBe(2);
    expect(r.yesterday.revenue).toBe(200);
    expect(r.orders.map((o) => o.id)).toEqual([1]);
  });

  it("começa o dia à meia-noite de Brasília, não UTC", () => {
    // 02:30 UTC do dia 27 = 23:30 do dia 26 em Brasília: é ontem
    const r = todaySales([order(1, "2026-10-27T02:30:00Z")], 0, now);
    expect(r.today.orders).toBe(0);
    expect(r.orders).toEqual([]);
  });

  it("avisa quando falta custo e zera tudo sem vendas", () => {
    const r = todaySales([order(1, "2026-10-27T12:00:00Z", {}, null)], 0, now);
    expect(r.today.hasCost).toBe(false);
    expect(r.orders[0].hasCost).toBe(false);
    const empty = todaySales([], 0.06, now);
    expect(empty.today).toEqual({ revenue: 0, orders: 0, units: 0, profit: 0, margin: 0, avgTicket: 0, hasCost: true });
  });
});
