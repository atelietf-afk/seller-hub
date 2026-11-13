import { describe, expect, it } from "vitest";
import { BOOST_INTERVAL_MS, BOOST_MAX_ITEMS, pickBoostItems } from "@/lib/analytics/boost";

const now = new Date("2026-11-13T12:00:00Z");
const item = (id: string, qty = 3, status = "active") => ({ id, status, available_quantity: qty });

describe("impulsionamento automático da Shopee", () => {
  it("escolhe no máximo 5 produtos", () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`SHP${i}`));
    expect(pickBoostItems(items, new Map(), now)).toHaveLength(BOOST_MAX_ITEMS);
  });

  it("só produtos ativos com estoque", () => {
    const items = [item("SHP1", 0), item("SHP2", 4, "unlist"), item("SHP3", 2), item("SHP4", 1)];
    expect(pickBoostItems(items, new Map(), now).map((i) => i.id)).toEqual(["SHP3", "SHP4"]);
  });

  it("produtos nunca impulsionados vêm primeiro, depois os mais antigos", () => {
    const items = [item("SHP1"), item("SHP2"), item("SHP3"), item("SHP4")];
    const last = new Map([
      ["SHP1", new Date(now.getTime() - 9 * 3600_000)],
      ["SHP2", new Date(now.getTime() - 20 * 3600_000)],
    ]);
    expect(pickBoostItems(items, last, now, 3).map((i) => i.id)).toEqual(["SHP3", "SHP4", "SHP2"]);
  });

  it("não repete produto impulsionado nas últimas 4 horas", () => {
    const items = [item("SHP1"), item("SHP2")];
    const last = new Map([["SHP1", new Date(now.getTime() - BOOST_INTERVAL_MS + 60_000)]]);
    expect(pickBoostItems(items, last, now).map((i) => i.id)).toEqual(["SHP2"]);
  });

  it("libera o produto depois de 4 horas", () => {
    const items = [item("SHP1")];
    const last = new Map([["SHP1", new Date(now.getTime() - BOOST_INTERVAL_MS)]]);
    expect(pickBoostItems(items, last, now).map((i) => i.id)).toEqual(["SHP1"]);
  });
});
