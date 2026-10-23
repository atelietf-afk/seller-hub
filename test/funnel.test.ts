import { describe, expect, it } from "vitest";
import { analyzeFunnel, median, type ItemFunnelInput } from "@/lib/analytics/funnel";

const base: Omit<ItemFunnelInput, "itemId" | "title"> = {
  status: "active",
  visits: 1000,
  orders: 20,
  units: 20,
  stock: 100,
  periodDays: 30,
  margin: 0.25,
};
const item = (id: string, over: Partial<ItemFunnelInput> = {}): ItemFunnelInput => ({ ...base, itemId: id, title: id, ...over });
const t = { lowStockDays: 7, minMargin: 0.1 };
const codes = (rows: ReturnType<typeof analyzeFunnel>, id: string) => rows.find((r) => r.itemId === id)!.diagnoses.map((d) => d.code);

describe("median", () => {
  it("funciona com quantidade par e ímpar", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("analyzeFunnel", () => {
  const store = [item("a"), item("b"), item("c"), item("d")];

  it("anúncio saudável não recebe alerta", () => {
    expect(codes(analyzeFunnel(store, t), "a")).toEqual(["healthy"]);
  });

  it("muita visita e pouca venda vira conversão baixa", () => {
    const rows = analyzeFunnel([...store, item("x", { visits: 2000, orders: 5, units: 5 })], t);
    expect(codes(rows, "x")).toContain("low_conversion");
  });

  it("pouca visita com boa conversão é oportunidade de anúncio", () => {
    const rows = analyzeFunnel([...store, item("x", { visits: 100, orders: 6, units: 6 })], t);
    expect(codes(rows, "x")).toEqual(["hidden_gem"]);
  });

  it("pouca visita e pouca venda vira tráfego baixo", () => {
    const rows = analyzeFunnel([...store, item("x", { visits: 100, orders: 0, units: 0 })], t);
    expect(codes(rows, "x")).toContain("low_traffic");
  });

  it("calcula os dias de estoque e alerta ruptura", () => {
    const rows = analyzeFunnel([...store, item("x", { units: 60, orders: 60, stock: 6 })], t);
    const x = rows.find((r) => r.itemId === "x")!;
    expect(x.stockDays).toBe(3);
    expect(codes(rows, "x")).toContain("stock_risk");
  });

  it("sem estoque e pausado têm prioridade", () => {
    const rows = analyzeFunnel([...store, item("s", { stock: 0 }), item("p", { status: "paused" })], t);
    expect(codes(rows, "s")).toEqual(["out_of_stock"]);
    expect(codes(rows, "p")).toEqual(["paused"]);
  });

  it("margem negativa é crítica", () => {
    const rows = analyzeFunnel([...store, item("x", { margin: -0.05 })], t);
    const d = rows.find((r) => r.itemId === "x")!.diagnoses.find((d) => d.code === "low_margin")!;
    expect(d.severity).toBe("critical");
  });

  it("sem custo não avalia margem", () => {
    const rows = analyzeFunnel([...store, item("x", { margin: null })], t);
    expect(codes(rows, "x")).not.toContain("low_margin");
  });
});
