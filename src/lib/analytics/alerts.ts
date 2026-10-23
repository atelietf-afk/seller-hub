// Alertas da central ao vivo, calculados a cada sincronização.

export interface VisitSeries {
  itemId: string;
  title: string;
  daily: { day: string; visits: number }[]; // em ordem crescente de data
}

export interface Alert {
  kind: "alert";
  severity: "warning" | "critical";
  title: string;
  body: string;
  itemId?: string;
  dedupeKey: string; // impede o mesmo alerta de aparecer duas vezes
}

/** Compara os últimos 7 dias com os 7 anteriores. */
export function visitsDropAlerts(series: VisitSeries[], dropThreshold: number, today: string): Alert[] {
  const alerts: Alert[] = [];
  for (const s of series) {
    const days = s.daily.filter((d) => d.day < today); // ignora o dia de hoje, ainda incompleto
    if (days.length < 14) continue;
    const last = days.slice(-7).reduce((a, d) => a + d.visits, 0);
    const prev = days.slice(-14, -7).reduce((a, d) => a + d.visits, 0);
    if (prev < 50) continue; // pouco volume para tirar conclusão
    const change = (last - prev) / prev;
    if (change <= -dropThreshold) {
      alerts.push({
        kind: "alert",
        severity: change <= -0.6 ? "critical" : "warning",
        title: `Visitas caíram ${Math.round(-change * 100)}%`,
        body: `"${s.title}": ${last} visitas nos últimos 7 dias contra ${prev} na semana anterior.`,
        itemId: s.itemId,
        dedupeKey: `visits-drop:${s.itemId}:${today}`,
      });
    }
  }
  return alerts;
}

export function reputationAlert(
  previous: string | null | undefined,
  current: string | null | undefined,
  today: string,
): Alert | null {
  // level_id do ML: 1_red, 2_orange, 3_yellow, 4_light_green, 5_green
  const rank = (l?: string | null) => (l ? Number.parseInt(l, 10) || 0 : 0);
  if (!previous || !current || rank(current) >= rank(previous)) return null;
  return {
    kind: "alert",
    severity: "critical",
    title: "Sua reputação caiu",
    body: `A cor da reputação passou de ${previous} para ${current}. Veja reclamações, atrasos e cancelamentos.`,
    dedupeKey: `reputation:${current}:${today}`,
  };
}
