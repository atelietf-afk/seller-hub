// Escolha dos produtos a impulsionar na Shopee: só os ativos com estoque, os que estão há mais tempo
// sem impulsionamento primeiro, e nenhum impulsionado nas últimas 4 horas.

export const BOOST_MAX_ITEMS = 5;
export const BOOST_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface BoostCandidate {
  id: string;
  status: string;
  available_quantity: number;
}

export function pickBoostItems(
  items: BoostCandidate[],
  lastBoosted: Map<string, Date>,
  now: Date,
  limit = BOOST_MAX_ITEMS,
): BoostCandidate[] {
  const eligible = items.filter((i) => i.status === "active" && i.available_quantity > 0);
  const recentlyBoosted = (id: string) => {
    const at = lastBoosted.get(id);
    return !!at && now.getTime() - at.getTime() < BOOST_INTERVAL_MS;
  };
  // Nunca impulsionado vem antes (tempo -infinito); empate pelo código, para a escolha ser estável.
  const age = (id: string) => lastBoosted.get(id)?.getTime() ?? -Infinity;
  return eligible
    .filter((i) => !recentlyBoosted(i.id))
    .sort((a, b) => age(a.id) - age(b.id) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
