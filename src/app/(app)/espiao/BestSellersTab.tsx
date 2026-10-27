import { Empty, Thumb } from "./ui";
import { SeverityBadge } from "@/components/Severity";
import { pricePosition } from "@/lib/analytics/keywords";
import { bestSellersFor, categoryNames, ownActiveItems } from "@/lib/data/spy";
import { brl, pct } from "@/lib/format";

export async function BestSellersTab({ ownerId, accountId, mlUserId }: { ownerId: string; accountId: string; mlUserId: number }) {
  const items = await ownActiveItems(ownerId, accountId, 200);
  const cats = [...new Set(items.map((i) => i.category_id).filter((c): c is string => !!c))];
  const [best, names] = await Promise.all([bestSellersFor(cats), categoryNames(cats)]);
  const name = new Map(names.map((n) => [n.id, n.name]));
  const withData = cats.filter((c) => best.some((b) => b.category_id === c));
  if (!withData.length) return <Empty>Ainda não temos os mais vendidos das suas categorias. Sincronize no Painel e volte em alguns minutos.</Empty>;

  return (
    <div className="space-y-6">
      {withData.map((cat) => {
        const top = best.filter((b) => b.category_id === cat);
        const mine = items.filter((i) => i.category_id === cat);
        const prices = top.map((b) => b.price ?? 0);
        const freeShare = top.filter((b) => b.free_shipping).length / top.length;
        const fullShare = top.filter((b) => b.logistic_type === "fulfillment").length / top.length;
        const mineInTop = top.filter((b) => b.seller_id === mlUserId).length;
        return (
          <section key={cat} className="rounded-xl border border-line bg-surface">
            <div className="p-4 pb-2">
              <h2 className="font-semibold">{name.get(cat) ?? cat}</h2>
              <p className="text-sm text-ink-2">
                Top {top.length}: {pct(freeShare, 0)} com frete grátis · {pct(fullShare, 0)} no Full · preço mediano{" "}
                {brl(pricePosition(1, prices)?.median ?? 0)}
                {mineInTop > 0 && ` · você aparece ${mineInTop}x no top`}
              </p>
            </div>
            <div className="space-y-2 px-4 pb-3">
              {mine.slice(0, 5).map((i) => {
                const p = pricePosition(i.price, prices);
                return (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="max-w-xs truncate font-medium">{i.title}</span>
                    <span className="text-ink-2">{brl(i.price)}</span>
                    {p && (
                      <SeverityBadge
                        severity={p.diffFromMedian > 0.15 ? "warning" : p.diffFromMedian < -0.15 ? "info" : "success"}
                        label={`${p.diffFromMedian >= 0 ? "+" : ""}${pct(p.diffFromMedian, 0)} vs. mediana`}
                      />
                    )}
                    {!i.free_shipping && freeShare >= 0.5 && <SeverityBadge severity="warning" label="sem frete grátis" />}
                    {i.logistic_type !== "fulfillment" && fullShare >= 0.5 && <SeverityBadge severity="info" label="fora do Full" />}
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-y border-line text-left text-xs text-muted">
                  <tr>
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Mais vendido</th>
                    <th className="p-3 text-right font-medium">Preço</th>
                    <th className="p-3 font-medium">Entrega</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {top.map((b) => (
                    <tr key={b.id} className={b.seller_id === mlUserId ? "bg-good/5" : ""}>
                      <td className="p-3 tabular-nums text-muted">{b.position}</td>
                      <td className="p-3">
                        <a href={b.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex max-w-md gap-2 hover:underline">
                          <Thumb src={b.thumbnail} />
                          <span className="line-clamp-2">
                            {b.title ?? b.id}
                            {b.seller_id === mlUserId && <span className="ml-1 text-xs text-good">(seu)</span>}
                          </span>
                        </a>
                      </td>
                      <td className="p-3 text-right tabular-nums">{b.price != null ? brl(b.price) : "—"}</td>
                      <td className="p-3 text-xs text-ink-2">
                        {[b.free_shipping ? "Frete grátis" : null, b.logistic_type === "fulfillment" ? "Full" : null].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
