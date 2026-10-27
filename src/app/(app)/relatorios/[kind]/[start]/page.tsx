import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccount } from "../../../NoAccount";
import { sendReportWhatsapp } from "../../../../actions";
import { PrintButton } from "@/components/PrintButton";
import { SalesChart } from "@/components/SalesChart";
import { SeverityBadge } from "@/components/Severity";
import { SubmitButton } from "@/components/SubmitButton";
import { periodLabel } from "@/lib/analytics/periods";
import { getReport } from "@/lib/data/reports";
import { brl, change, dateOnly, dateTime, int, pct } from "@/lib/format";
import type { Mover } from "@/lib/period-report";
import { currentAccount } from "@/lib/session";

const KIND = { weekly: "Relatório semanal", monthly: "Relatório mensal" } as const;

const WHATSAPP_MSG: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Relatório enviado no seu WhatsApp." },
  erro: { ok: false, text: "Não foi possível enviar no WhatsApp." },
  "sem-numero": { ok: false, text: "Cadastre seu número de WhatsApp em Configurações para receber os relatórios." },
  desligado: { ok: false, text: "O envio por WhatsApp ainda não foi ativado no servidor." },
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; start: string }>;
  searchParams: Promise<{ whatsapp?: string }>;
}) {
  const { user, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const { kind, start } = await params;
  const whatsapp = WHATSAPP_MSG[(await searchParams).whatsapp ?? ""];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || (kind !== "weekly" && kind !== "monthly")) notFound();
  const report = await getReport(user.id, account.id, kind, start);
  if (!report) notFound();
  const { data: d, ai } = report;
  const t = d.totals;
  const p = d.previous;

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex items-center gap-3">
        <Link href="/relatorios" className="text-sm text-accent">
          ← Relatórios
        </Link>
        <span className="ml-auto" />
        <form action={sendReportWhatsapp}>
          <input type="hidden" name="kind" value={report.kind} />
          <input type="hidden" name="start" value={report.period_start} />
          <SubmitButton pending="Enviando…">Enviar no WhatsApp</SubmitButton>
        </form>
        <PrintButton />
      </div>
      {whatsapp && (
        <p className={`no-print rounded-md p-3 text-sm ${whatsapp.ok ? "bg-good/10 text-good" : "bg-critical/10 text-critical"}`}>
          {whatsapp.text}
          {!whatsapp.ok && report.whatsapp_error ? ` Motivo: ${report.whatsapp_error}.` : ""}
        </p>
      )}

      <header>
        <p className="text-sm text-muted">
          {KIND[report.kind]}
          {d.nickname ? ` · ${d.nickname}` : ""}
        </p>
        <h1 className="text-2xl font-semibold">{periodLabel(d.period)}</h1>
        <p className="text-sm text-ink-2">
          Comparado com {periodLabel(d.previousPeriod)} · gerado em {dateTime(report.created_at)}
          {report.whatsapp_sent_at && <> · enviado no WhatsApp em {dateTime(report.whatsapp_sent_at)}</>}
        </p>
        {d.incompleteSince && (
          <p className="mt-2 rounded-md bg-warning/20 p-2 text-sm">
            Ainda estamos buscando o histórico de pedidos (temos desde {dateOnly(d.incompleteSince)}). Os
            números deste período ou da comparação podem estar incompletos; a cada sincronização buscamos mais 30 dias. Gere de novo
            depois.
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Faturamento" value={brl(t.revenue)} now={t.revenue} before={p.revenue} />
        <Stat label="Vendas" value={int(t.orders)} now={t.orders} before={p.orders} hint={`${int(t.units)} unidades`} />
        <Stat label="Ticket médio" value={brl(t.avgTicket)} now={t.avgTicket} before={p.avgTicket} />
        <Stat
          label="Lucro após anúncios"
          value={brl(t.profitAfterAds)}
          now={t.profitAfterAds}
          before={p.profitAfterAds}
          hint={d.missingCosts ? `${d.missingCosts} anúncio(s) sem custo: lucro superestimado` : `margem ${pct(t.margin)}`}
        />
      </section>

      {ai && (
        <section className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 font-semibold">Análise</h2>
          <p className="text-base font-medium">{ai.headline}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            {ai.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="mt-3 font-medium">O que fazer agora</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {ai.actions.map((a) => (
              <li key={a.title}>
                <span className="font-medium">{a.title}</span> <span className="text-ink-2">— {a.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Faturamento e lucro por dia</h2>
        <SalesChart data={d.daily} />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Para onde foi o dinheiro</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium" />
              <th className="pb-2 text-right font-medium">{periodLabel(d.period)}</th>
              <th className="pb-2 text-right font-medium">Anterior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            <Row label="Faturamento" a={t.revenue} b={p.revenue} />
            <Row label="Comissões do Mercado Livre" a={-t.fees} b={-p.fees} />
            <Row label="Frete pago por você" a={-t.shipping} b={-p.shipping} />
            <Row label="Impostos" a={-t.tax} b={-p.tax} />
            <Row label="Custo dos produtos" a={-t.productCost} b={-p.productCost} />
            <Row label="Lucro antes dos anúncios" a={t.profit} b={p.profit} strong />
            <Row label="Investimento em anúncios" a={-t.adCost} b={-p.adCost} />
            <Row label="Lucro após anúncios" a={t.profitAfterAds} b={p.profitAfterAds} strong />
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 font-semibold">Publicidade</h2>
          {t.adCost > 0 || p.adCost > 0 ? (
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-ink-2">Investimento</dt>
              <dd className="text-right tabular-nums">{brl(t.adCost)}</dd>
              <dt className="text-ink-2">Vendas com anúncios</dt>
              <dd className="text-right tabular-nums">{brl(t.adRevenue)}</dd>
              <dt className="text-ink-2">ACOS</dt>
              <dd className="text-right tabular-nums">{t.acos != null ? pct(t.acos) : "—"}</dd>
              <dt className="text-ink-2">TACOS</dt>
              <dd className="text-right tabular-nums">{t.tacos != null ? pct(t.tacos) : "—"}</dd>
            </dl>
          ) : (
            <p className="text-ink-2">Sem investimento em anúncios no período.</p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 font-semibold">Tráfego</h2>
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-ink-2">Visitas</dt>
            <dd className="text-right tabular-nums">{int(t.visits)}</dd>
            <dt className="text-ink-2">Conversão</dt>
            <dd className="text-right tabular-nums">{pct(t.conversion, 2)}</dd>
            <dt className="text-ink-2">Perguntas sem resposta (agora)</dt>
            <dd className="text-right tabular-nums">{int(d.unansweredQuestions)}</dd>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Produtos que mais faturaram</h2>
        {d.topProducts.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Produto</th>
                <th className="pb-2 text-right font-medium">Unid.</th>
                <th className="pb-2 text-right font-medium">Faturamento</th>
                <th className="pb-2 text-right font-medium">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.topProducts.map((x) => (
                <tr key={x.itemId}>
                  <td className="py-2 pr-2">
                    <p className="line-clamp-1">{x.title}</p>
                    <p className="text-xs text-muted">{x.itemId}</p>
                  </td>
                  <td className="py-2 text-right tabular-nums">{int(x.units)}</td>
                  <td className="py-2 text-right tabular-nums">{brl(x.revenue)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {x.profit != null ? (
                      <>
                        {brl(x.profit)}
                        {x.margin != null && <span className="block text-xs text-muted">{pct(x.margin)}</span>}
                      </>
                    ) : (
                      <span className="text-muted">sem custo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ink-2">Nenhuma venda no período.</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Movers title="Mais cresceram" list={d.movers.up} />
        <Movers title="Mais caíram" list={d.movers.down} />
      </section>

      {d.problems.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Pontos de atenção</h2>
          <ul className="divide-y divide-line text-sm">
            {d.problems.map((x) => (
              <li key={`${x.itemId}-${x.message}`} className="flex gap-3 py-2">
                <SeverityBadge severity={x.severity} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{x.title}</p>
                  <p className="text-ink-2">{x.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Stat({ label, value, now, before, hint }: { label: string; value: string; now: number; before: number; hint?: string }) {
  const d = change(now, before);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">
        {d != null && <span className={d >= 0 ? "text-good" : "text-critical"}>{`${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))} `}</span>}
        {hint ?? "vs. período anterior"}
      </p>
    </div>
  );
}

function Row({ label, a, b, strong }: { label: string; a: number; b: number; strong?: boolean }) {
  // `|| 0` tira o "-R$ 0,00" que aparece com -0.
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="py-1.5 text-ink-2">{label}</td>
      <td className="py-1.5 text-right">{brl(a || 0)}</td>
      <td className="py-1.5 text-right text-ink-2">{brl(b || 0)}</td>
    </tr>
  );
}

function Movers({ title, list }: { title: string; list: Mover[] }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4 text-sm">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.itemId} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="shrink-0 tabular-nums text-ink-2">
                {brl(m.prevRevenue)} → {brl(m.revenue)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">Nada relevante.</p>
      )}
    </div>
  );
}
