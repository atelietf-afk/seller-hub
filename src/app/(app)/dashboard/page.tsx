import Link from "next/link";
import { markEventsRead, summarizeNow, syncNow } from "../../actions";
import { NoAccount } from "../NoAccount";
import { Kpi } from "@/components/Kpi";
import { LiveFeed } from "@/components/LiveFeed";
import { SalesChart } from "@/components/SalesChart";
import { SeverityBadge } from "@/components/Severity";
import { SubmitButton } from "@/components/SubmitButton";
import { latestSummary, recentEvents } from "@/lib/data/accounts";
import { brl, change, int, pct } from "@/lib/format";
import { buildReport } from "@/lib/report";
import { currentAccount } from "@/lib/session";

const ERRORS: Record<string, string> = {
  sync: "Não conseguimos sincronizar com o Mercado Livre agora. Tente de novo em alguns minutos.",
  resumo: "Não conseguimos gerar a análise agora. Confira a chave da Anthropic e tente de novo.",
  "sem-conexao": "A conexão com o Mercado Livre não foi concluída. Clique em Reconectar.",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ conectado?: string; erro?: string }> }) {
  const { account } = await currentAccount();
  if (!account) return <NoAccount />;
  const { conectado, erro } = await searchParams;

  const [report, events, summaryRow] = await Promise.all([
    buildReport(account.id, account.owner_id, 7),
    recentEvents(account.id),
    latestSummary(account.id),
  ]);
  const t = report.totals;
  const summary = summaryRow?.content;
  const attention = report.funnel
    .flatMap((f) => f.diagnoses.filter((d) => d.severity === "critical" || d.severity === "warning").map((d) => ({ ...d, item: f })))
    .sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Últimos 7 dias</h1>
        <p className="text-sm text-muted">
          {account.last_synced_at
            ? `Sincronizado em ${new Date(account.last_synced_at).toLocaleString("pt-BR")}`
            : "Primeira sincronização em andamento…"}
        </p>
        <form action={syncNow} className="ml-auto">
          <SubmitButton pending="Sincronizando…">Sincronizar agora</SubmitButton>
        </form>
      </div>
      {!account.connected && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-critical/10 p-3 text-sm">
          <SeverityBadge severity="critical" label="Desconectado" />
          <span>A conexão com o Mercado Livre não foi concluída, então não há dados para mostrar.</span>
          <Link href="/api/ml/connect" className="ml-auto rounded-md bg-accent px-3 py-1.5 font-medium text-white">
            Reconectar
          </Link>
        </div>
      )}
      {erro && ERRORS[erro] && account.connected !== false && (
        <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[erro]}</p>
      )}
      {conectado && (
        <p className="rounded-md bg-good/10 p-3 text-sm">
          Conta conectada! Estamos buscando seus anúncios, pedidos e visitas. Em alguns minutos os números aparecem aqui.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Faturamento" value={brl(t.revenue)} delta={change(t.revenue, report.previous.revenue)} hint="vs. 7 dias antes" />
        <Kpi label="Vendas" value={int(t.orders)} delta={change(t.orders, report.previous.orders)} hint={`${int(t.units)} unidades`} />
        <Kpi
          label="Lucro real"
          value={brl(t.profit)}
          delta={change(t.profit, report.previous.profit)}
          hint={report.missingCosts ? `${report.missingCosts} anúncio(s) sem custo` : `margem ${pct(t.margin)}`}
        />
        <Kpi label="Visitas" value={int(t.visits)} hint={`conversão ${pct(t.conversion, 2)}`} />
        <Link href="/perguntas" className="block">
          <Kpi label="Perguntas sem resposta" value={int(report.unansweredQuestions)} hint="responder com IA →" />
        </Link>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0 space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Resumo do dia</h2>
              {summaryRow && <span className="text-xs text-muted">{new Date(summaryRow.created_at).toLocaleString("pt-BR")}</span>}
              <form action={summarizeNow} className="ml-auto">
                <SubmitButton pending="Analisando…">{summary ? "Atualizar análise" : "Gerar análise"}</SubmitButton>
              </form>
            </div>
            {summary ? (
              <div className="space-y-3 text-sm">
                <p className="text-base font-medium">{summary.headline}</p>
                <ul className="list-disc space-y-1 pl-5 text-ink-2">
                  {summary.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <div>
                  <p className="font-medium">O que fazer agora</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    {summary.actions.map((a) => (
                      <li key={a.title}>
                        <span className="font-medium">{a.title}</span> <span className="text-ink-2">— {a.why}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-2">
                A IA lê os números da semana e explica, em linguagem simples, o que mudou e o que fazer. Gerado
                automaticamente todo dia de manhã.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-semibold">Faturamento e lucro por dia</h2>
            <SalesChart data={report.daily} />
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center">
              <h2 className="font-semibold">Precisa de atenção</h2>
              <Link href="/produtos" className="ml-auto text-sm text-accent">
                Ver todos os produtos
              </Link>
            </div>
            {attention.length ? (
              <ul className="divide-y divide-line">
                {attention.map((a) => (
                  <li key={`${a.item.itemId}-${a.code}`} className="flex gap-3 py-2.5 text-sm">
                    <SeverityBadge severity={a.severity} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.item.title}</p>
                      <p className="text-ink-2">{a.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Nenhum problema nos seus anúncios esta semana.</p>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <div className="mb-1 flex items-center">
            <h2 className="font-semibold">Central ao vivo</h2>
            <form action={markEventsRead} className="ml-auto">
              <button className="text-xs text-muted hover:text-ink">Marcar como lido</button>
            </form>
          </div>
          <LiveFeed accountId={account.id} initial={events} />
        </section>
      </div>
    </div>
  );
}
