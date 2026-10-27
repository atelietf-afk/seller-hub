import { Empty, Thumb } from "./ui";
import { SeverityBadge, type Severity } from "@/components/Severity";
import { catalogFor } from "@/lib/data/spy";
import { brl } from "@/lib/format";

const STATUS: Record<string, { label: string; severity: Severity }> = {
  winning: { label: "Ganhando", severity: "success" },
  sharing_first_place: { label: "Dividindo o 1º lugar", severity: "success" },
  competing: { label: "Perdendo", severity: "critical" },
  listed: { label: "Não compete", severity: "warning" },
};

// Motivos mais comuns devolvidos pelo ML; os demais aparecem como vieram.
const REASONS: Record<string, string> = {
  non_trusted_seller: "reputação ou histórico insuficiente",
  reputation_below_threshold: "reputação abaixo do exigido",
  manufacturing_time: "tem prazo de fabricação",
  shipping_not_free: "sem frete grátis",
  winner_has_better_shipping: "o vencedor tem entrega melhor",
  winner_has_free_installments: "o vencedor oferece parcelamento sem juros",
  item_paused: "anúncio pausado",
  temporarily_winning_manual_review: "em revisão manual",
};

export async function CatalogTab({ ownerId, accountId }: { ownerId: string; accountId: string }) {
  const rows = await catalogFor(ownerId, accountId);
  if (!rows.length) {
    return <Empty>Nenhum anúncio seu está no catálogo (ou ainda não sincronizamos). Anúncios de catálogo disputam a vitrine principal do produto.</Empty>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="p-3 font-medium">Anúncio</th>
            <th className="p-3 font-medium">Situação</th>
            <th className="p-3 text-right font-medium">Seu preço</th>
            <th className="p-3 text-right font-medium">Preço para ganhar</th>
            <th className="p-3 text-right font-medium">Vencedor</th>
            <th className="p-3 font-medium">Motivos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const s = STATUS[r.status ?? ""] ?? { label: r.status ?? "—", severity: "info" as const };
            return (
              <tr key={r.item_id} className="align-top">
                <td className="p-3">
                  <div className="flex max-w-xs gap-2">
                    <Thumb src={r.thumbnail} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium">{r.title}</p>
                      <p className="text-xs text-muted">{r.item_id}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <SeverityBadge severity={s.severity} label={s.label} />
                </td>
                <td className="p-3 text-right tabular-nums">{r.price != null ? brl(r.price) : "—"}</td>
                <td className="p-3 text-right tabular-nums">
                  {r.price_to_win != null ? brl(r.price_to_win) : "—"}
                  {r.price != null && r.price_to_win != null && r.price_to_win < r.price && (
                    <p className="text-xs text-critical">−{brl(r.price - r.price_to_win)}</p>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums">{r.winner_price != null ? brl(r.winner_price) : "—"}</td>
                <td className="p-3 text-xs text-ink-2">{(r.reasons ?? []).map((x) => REASONS[x] ?? x).join(", ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
