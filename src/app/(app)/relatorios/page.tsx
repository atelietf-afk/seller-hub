import Link from "next/link";
import { generateReportNow } from "../../actions";
import { NoAccount } from "../NoAccount";
import { SubmitButton } from "@/components/SubmitButton";
import { periodLabel } from "@/lib/analytics/periods";
import { listReports } from "@/lib/data/reports";
import { brl, change, pct } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const KIND = { weekly: "Semanal", monthly: "Mensal" } as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { ownerId, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const { erro } = await searchParams;
  const reports = await listReports(ownerId, account.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Relatórios</h1>
          <p className="text-sm text-ink-2">
            Gerados sozinhos: o semanal toda segunda e o mensal todo dia 1. Cada um compara com o período anterior.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <form action={generateReportNow}>
            <input type="hidden" name="kind" value="weekly" />
            <SubmitButton pending="Gerando…">Gerar da última semana</SubmitButton>
          </form>
          <form action={generateReportNow}>
            <input type="hidden" name="kind" value="monthly" />
            <SubmitButton pending="Gerando…">Gerar do último mês</SubmitButton>
          </form>
        </div>
      </div>
      {erro && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">Não conseguimos gerar o relatório agora. Tente de novo em alguns minutos.</p>}

      {reports.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-2">
          Nenhum relatório ainda. Gere o primeiro com os botões acima.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Relatório</th>
                <th className="p-3 text-right font-medium">Faturamento</th>
                <th className="p-3 text-right font-medium">Lucro após anúncios</th>
                <th className="p-3 text-right font-medium">Vendas</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => {
                const t = r.data.totals;
                const d = change(t.revenue, r.data.previous.revenue);
                return (
                  <tr key={`${r.kind}-${r.period_start}`}>
                    <td className="p-3">
                      <p className="font-medium">{periodLabel(r.data.period)}</p>
                      <p className="text-xs text-muted">{KIND[r.kind]}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {brl(t.revenue)}
                      {d != null && <p className={`text-xs ${d >= 0 ? "text-good" : "text-critical"}`}>{`${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))}`}</p>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{brl(t.profitAfterAds)}</td>
                    <td className="p-3 text-right tabular-nums">{t.orders}</td>
                    <td className="p-3 text-right">
                      <Link href={`/relatorios/${r.kind}/${r.period_start}`} className="text-accent">
                        Abrir
                      </Link>
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
