import Link from "next/link";
import { saveCost } from "../../actions";
import { NoAccount } from "../NoAccount";
import { SeverityBadge } from "@/components/Severity";
import { brl, decimal, int, pct } from "@/lib/format";
import { buildReport } from "@/lib/report";
import { currentAccount } from "@/lib/session";

const PERIODS = [7, 15, 30];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { account } = await currentAccount();
  if (!account) return <NoAccount />;
  const dias = Number((await searchParams).dias);
  const period = PERIODS.includes(dias) ? dias : 30;
  const report = await buildReport(account.id, account.owner_id, period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Produtos e funil</h1>
        <div className="ml-auto flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={`/produtos?dias=${p}`} className={`rounded-md px-3 py-1 ${p === period ? "bg-accent text-white" : "text-ink-2"}`}>
              {p} dias
            </Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-ink-2">
        Visitas → vendas de cada anúncio, comparadas com a média da sua loja. Informe o custo de cada produto para ver o lucro
        real (já descontamos comissão do ML, frete e imposto).
      </p>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="p-3 font-medium">Anúncio</th>
              <th className="p-3 text-right font-medium">Visitas</th>
              <th className="p-3 text-right font-medium">Vendas</th>
              <th className="p-3 text-right font-medium">Conversão</th>
              <th className="p-3 text-right font-medium">Faturamento</th>
              <th className="p-3 text-right font-medium">Lucro</th>
              <th className="p-3 text-right font-medium">Estoque</th>
              <th className="p-3 font-medium">Custo unitário</th>
              <th className="p-3 font-medium">Diagnóstico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.funnel.map((f) => (
              <tr key={f.itemId} className="align-top">
                <td className="p-3">
                  <div className="flex max-w-xs gap-2">
                    {f.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium">{f.title}</p>
                      <p className="text-xs text-muted">
                        {f.itemId} · {brl(f.price)} {f.status !== "active" && `· ${f.status}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums">{int(f.visits)}</td>
                <td className="p-3 text-right tabular-nums">{int(f.orders)}</td>
                <td className="p-3 text-right tabular-nums">{f.visits ? pct(f.conversion, 2) : "—"}</td>
                <td className="p-3 text-right tabular-nums">{brl(f.revenue)}</td>
                <td className={`p-3 text-right tabular-nums ${f.unitCost && f.profit < 0 ? "text-critical" : ""}`}>
                  {f.unitCost ? brl(f.profit) : <span className="text-muted">sem custo</span>}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {int(f.stock)}
                  {f.stockDays !== null && <p className="text-xs text-muted">~{Math.round(f.stockDays)} dias</p>}
                </td>
                <td className="p-3">
                  <form action={saveCost} className="flex gap-1">
                    <input type="hidden" name="itemId" value={f.itemId} />
                    <input
                      name="unitCost"
                      defaultValue={f.unitCost != null ? decimal(f.unitCost) : ""}
                      inputMode="decimal"
                      placeholder="R$"
                      aria-label={`Custo de ${f.title}`}
                      className="w-20 rounded-md border border-line bg-bg px-2 py-1"
                    />
                    <button className="rounded-md border border-line px-2 text-xs">Salvar</button>
                  </form>
                </td>
                <td className="space-y-1 p-3">
                  {f.diagnoses.map((d) => (
                    <div key={d.code} className="flex items-start gap-2">
                      <SeverityBadge severity={d.severity} />
                      <span className="text-ink-2">{d.message}</span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.funnel.length && <p className="p-6 text-center text-sm text-ink-2">Nenhum anúncio sincronizado ainda.</p>}
      </div>
    </div>
  );
}
