import { addCompetitor, removeCompetitor } from "../../actions";
import { Thumb } from "./ui";
import { SubmitButton } from "@/components/SubmitButton";
import { competitorsFor } from "@/lib/data/spy";
import { brl, int, pct } from "@/lib/format";

export async function CompetitorsTab({ ownerId, accountId }: { ownerId: string; accountId: string }) {
  const rows = await competitorsFor(ownerId, accountId);
  return (
    <div className="space-y-4">
      <form action={addCompetitor} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-4">
        <label className="min-w-0 flex-1 text-sm">
          Link ou código do anúncio do concorrente
          <input
            name="link"
            required
            placeholder="https://produto.mercadolivre.com.br/MLB-123… ou MLB123…"
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Apelido (opcional)
          <input name="note" maxLength={80} placeholder="ex.: Loja X" className="mt-1 block w-40 rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <SubmitButton pending="Buscando…" className="py-2">
          Acompanhar
        </SubmitButton>
      </form>
      <p className="text-sm text-ink-2">
        Atualizamos preço e situação a cada sincronização e avisamos na Central ao vivo quando um concorrente baixa o preço 3% ou mais.
        O Mercado Livre não divulga vendas e estoque exatos de outros vendedores; quando divulga, mostramos.
      </p>

      {rows.length === 0 ? null : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Concorrente</th>
                <th className="p-3 text-right font-medium">Preço atual</th>
                <th className="p-3 text-right font-medium">7 dias</th>
                <th className="p-3 text-right font-medium">Menor preço visto</th>
                <th className="p-3 font-medium">Entrega</th>
                <th className="p-3 text-right font-medium">Vendidos</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const change = r.price && r.week_ago_price ? r.price / r.week_ago_price - 1 : null;
                return (
                  <tr key={r.item_id} className="align-top">
                    <td className="p-3">
                      <a href={r.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex max-w-sm gap-2 hover:underline">
                        <Thumb src={r.thumbnail} />
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium">{r.title ?? r.item_id}</p>
                          <p className="text-xs text-muted">
                            {r.note ? `${r.note} · ` : ""}
                            {r.item_id}
                            {r.kind === "product" ? " · produto de catálogo (preço do vencedor)" : ""}
                            {r.status && r.status !== "active" ? ` · ${r.status}` : ""}
                          </p>
                        </div>
                      </a>
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.price != null ? brl(r.price) : "—"}</td>
                    <td className={`p-3 text-right tabular-nums ${change == null ? "" : change < 0 ? "text-critical" : "text-good"}`}>
                      {change == null ? "—" : `${change > 0 ? "+" : ""}${pct(change)}`}
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.min_price != null ? brl(r.min_price) : "—"}</td>
                    <td className="p-3 text-xs text-ink-2">
                      {[r.free_shipping ? "Frete grátis" : null, r.logistic_type === "fulfillment" ? "Full" : null].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.sold_quantity != null ? int(r.sold_quantity) : <span className="text-muted">não divulgado</span>}</td>
                    <td className="p-3 text-right">
                      <form action={removeCompetitor}>
                        <input type="hidden" name="itemId" value={r.item_id} />
                        <button className="text-xs text-critical">Remover</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
