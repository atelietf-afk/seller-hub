// Produtos que mais subiram e mais caíram em faturamento entre dois períodos.

export interface Mover {
  itemId: string;
  title: string;
  revenue: number;
  prevRevenue: number;
  change: number; // fração; 1 quando não havia venda antes
}

interface Sales {
  itemId: string;
  title: string;
  revenue: number;
}

/** Ignora bases muito pequenas (menos de R$ 50 ou de 1% do faturamento anterior) para não destacar ruído. */
export function computeMovers(current: Sales[], previous: Sales[], limit = 5): { up: Mover[]; down: Mover[] } {
  const prev = new Map(previous.map((f) => [f.itemId, f.revenue]));
  const all: Mover[] = current
    .map((f) => ({ itemId: f.itemId, title: f.title, revenue: f.revenue, prevRevenue: prev.get(f.itemId) ?? 0 }))
    .filter((m) => m.revenue + m.prevRevenue > 0)
    .map((m) => ({ ...m, change: m.prevRevenue > 0 ? m.revenue / m.prevRevenue - 1 : 1 }));
  const minBase = Math.max(50, all.reduce((a, m) => a + m.prevRevenue, 0) * 0.01);
  const delta = (m: Mover) => m.revenue - m.prevRevenue;
  return {
    up: all
      .filter((m) => delta(m) > 0 && (m.prevRevenue >= minBase || m.revenue >= minBase))
      .sort((a, b) => delta(b) - delta(a))
      .slice(0, limit),
    down: all
      .filter((m) => delta(m) < 0 && m.prevRevenue >= minBase)
      .sort((a, b) => delta(a) - delta(b))
      .slice(0, limit),
  };
}
