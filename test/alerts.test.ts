import { describe, expect, it } from "vitest";
import { reputationAlert, visitsDropAlerts } from "@/lib/analytics/alerts";

function series(prev: number, last: number) {
  const daily = [];
  for (let i = 0; i < 15; i++) {
    const day = `2026-10-${String(i + 1).padStart(2, "0")}`;
    daily.push({ day, visits: i < 7 ? prev : last });
  }
  return { itemId: "MLB1", title: "Fone", daily };
}

describe("visitsDropAlerts", () => {
  // Hoje = dia 15 (ignorado); semana anterior = dias 1–7, última = 8–14.
  it("alerta quando as visitas caem mais que o limite", () => {
    const [a] = visitsDropAlerts([series(20, 10)], 0.3, "2026-10-15");
    expect(a.title).toBe("Visitas caíram 50%");
    expect(a.severity).toBe("warning");
    expect(a.dedupeKey).toBe("visits-drop:MLB1:2026-10-15");
  });

  it("queda forte é crítica", () => {
    expect(visitsDropAlerts([series(20, 5)], 0.3, "2026-10-15")[0].severity).toBe("critical");
  });

  it("ignora quedas pequenas e volume baixo", () => {
    expect(visitsDropAlerts([series(20, 18)], 0.3, "2026-10-15")).toEqual([]);
    expect(visitsDropAlerts([series(5, 1)], 0.3, "2026-10-15")).toEqual([]);
  });

  it("precisa de 14 dias completos", () => {
    const s = series(20, 5);
    s.daily = s.daily.slice(-10);
    expect(visitsDropAlerts([s], 0.3, "2026-10-15")).toEqual([]);
  });
});

describe("reputationAlert", () => {
  it("avisa só quando a reputação piora", () => {
    expect(reputationAlert("5_green", "4_light_green", "2026-10-15")?.severity).toBe("critical");
    expect(reputationAlert("4_light_green", "5_green", "2026-10-15")).toBeNull();
    expect(reputationAlert(null, "3_yellow", "2026-10-15")).toBeNull();
  });
});
