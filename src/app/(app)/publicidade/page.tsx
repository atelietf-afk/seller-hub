import Link from "next/link";
import { Fragment } from "react";
import { syncNow } from "../../actions";
import { NoAccount } from "../NoAccount";
import { AdSuggestions } from "@/components/AdSuggestions";
import { AdsChart } from "@/components/AdsChart";
import { Kpi } from "@/components/Kpi";
import { SeverityBadge } from "@/components/Severity";
import { SubmitButton } from "@/components/SubmitButton";
import type { AdDecision, AdsTotals, CampaignDiagnosis } from "@/lib/analytics/ads";
import { buildAdsReport } from "@/lib/ads-report";
import { settingsOf } from "@/lib/data/accounts";
import { brl, dateTime, int, pct } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  idle: "Ociosa",
  hold: "Retida",
};
const STRATEGY_LABEL: Record<string, string> = {
  profitability: "Rentabilidade",
  increase: "Crescimento",
  visibility: "Visibilidade",
};
const DECISION: Record<
  AdDecision,
  {
    label: string;
    severity: "success" | "info" | "warning" | "critical";
    order: number;
  }
> = {
  pausar: { label: "Pausar", severity: "critical", order: 0 },
  reduzir: { label: "Reduzir", severity: "critical", order: 1 },
  revisar: { label: "Revisar", severity: "warning", order: 2 },
  escalar: { label: "Escalar", severity: "success", order: 3 },
  cadastrar_custo: { label: "Sem custo", severity: "info", order: 4 },
  manter: { label: "Manter", severity: "info", order: 5 },
};
const opt = (n: number | null, f: (n: number) => string) => (n === null ? "—" : f(n));
const roas = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ decisao?: string }> }) {
  const { user, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const [r, settings] = await Promise.all([buildAdsReport(user.id, account.id), settingsOf(user.id)]);
  if (!r) return <NoAccount />;
  const requested = (await searchParams).decisao;
  const filter = requested && requested in DECISION ? (requested as AdDecision) : null;
  const t = r.totals;
  const status = r.status.ads_status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Publicidade · últimos {r.periodDays} dias</h1>
        <p className="text-sm text-muted">
          {r.status.ads_synced_at ? `Atualizado em ${dateTime(r.status.ads_synced_at)}` : "Ainda não sincronizado"}
        </p>
        <form action={syncNow} className="ml-auto">
          <SubmitButton pending="Sincronizando…">Sincronizar agora</SubmitButton>
        </form>
      </div>

      {status === null && (
        <p className="rounded-md bg-ink/5 p-3 text-sm">
          Clique em <strong>Sincronizar agora</strong> para buscar suas campanhas do Mercado Livre Ads.
        </p>
      )}
      {status === "sem_product_ads" && (
        <p className="rounded-md bg-ink/5 p-3 text-sm">
          Sua conta não tem Product Ads (Mercado Livre Ads) ativo. Quando você criar uma campanha, os dados aparecem aqui.
        </p>
      )}
      {status === "erro" && (
        <div className="flex flex-wrap items-start gap-2 rounded-md bg-critical/10 p-3 text-sm">
          <SeverityBadge severity="critical" label="Erro" />
          <div>
            <p>
              Não conseguimos ler a publicidade no Mercado Livre. Confira se o app tem a permissão{" "}
              <strong>Publicidade de um produto</strong> e sincronize de novo.
            </p>
            {r.status.ads_error && <p className="mt-1 text-xs text-ink-2">Detalhe técnico: {r.status.ads_error}</p>}
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Investimento" value={brl(t.cost)} hint={`${int(t.clicks)} cliques`} />
        <Kpi label="Vendas com anúncios" value={brl(t.revenue)} hint={`${int(t.units)} unidades`} />
        <Kpi label="ACOS" value={opt(t.acos, (n) => pct(n))} hint="investimento ÷ vendas" />
        <Kpi label="ROAS" value={opt(t.roas, roas)} hint="vendas por R$ 1 investido" />
        <Kpi label="TACOS" value={opt(r.tacos, (n) => pct(n))} hint={`do faturamento total (${brl(r.totalRevenue)})`} />
        <Kpi
          label="Lucro após anúncios"
          value={brl(r.profitAfterAds)}
          hint={r.marginKnown ? `antes dos anúncios: ${brl(r.profitBeforeAds)}` : "cadastre os custos para ficar exato"}
        />
      </section>

      {r.wasted > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-critical/10 p-3 text-sm">
          <SeverityBadge severity="critical" label="Desperdício" />
          <span>
            <strong>{brl(r.wasted)}</strong> foram para anúncios sem estoque, inativos ou que não venderam. Veja os marcados como{" "}
            <strong>Pausar</strong> em Produtos anunciados.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Investimento e vendas com anúncios por dia</h2>
        {r.daily.some((d) => d.cost > 0 || d.revenue > 0) ? (
          <AdsChart data={r.daily} />
        ) : (
          <p className="text-sm text-ink-2">Sem dados diários ainda.</p>
        )}
      </div>

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="p-4 pb-0 font-semibold">Campanhas</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Campanha</th>
                <th className="p-3 text-right font-medium">Orçamento/dia</th>
                <th className="p-3 text-right font-medium" title="Das vezes em que o anúncio poderia aparecer, em quantas apareceu">
                  Exibições
                </th>
                <Metrics.Head />
              </tr>
            </thead>
            <tbody>
              {r.campaigns.map((c) => {
                const belowBreakEven = c.roas_target !== null && c.breakEvenRoas !== null && c.roas_target < c.breakEvenRoas;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-t border-line align-top">
                      <td className="p-3">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted">
                          {STATUS_LABEL[c.status ?? ""] ?? c.status ?? "—"}
                          {c.strategy ? ` · ${STRATEGY_LABEL[c.strategy.toLowerCase()] ?? c.strategy}` : ""}
                        </p>
                        <p className="mt-1 text-xs">
                          <span className={belowBreakEven ? "font-medium text-critical" : ""}>
                            ROAS objetivo {c.roas_target !== null ? roas(c.roas_target) : "—"}
                          </span>
                          {c.breakEvenRoas !== null && <span className="text-muted"> · equilíbrio {roas(c.breakEvenRoas)}</span>}
                        </p>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {c.budget != null ? brl(c.budget) : "—"}
                        {c.budgetUsage !== null && <p className="text-xs text-muted">usa {pct(Math.min(c.budgetUsage, 9.99), 0)}</p>}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {c.impression_share !== null ? pct(c.impression_share, 0) : "—"}
                        {(c.lost_by_budget ?? 0) > 0 && <p className="text-xs text-muted">−{pct(c.lost_by_budget!, 0)} orçamento</p>}
                        {(c.lost_by_rank ?? 0) > 0 && <p className="text-xs text-muted">−{pct(c.lost_by_rank!, 0)} classificação</p>}
                      </td>
                      <Metrics.Cells t={c.totals} />
                    </tr>
                    <tr>
                      <td colSpan={10} className="px-3 pb-3">
                        <Diagnoses list={c.diagnoses} />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!r.campaigns.length && <p className="p-6 text-center text-sm text-ink-2">Nenhuma campanha encontrada.</p>}
        </div>
      </section>

      {status === "ok" && <AdSuggestions result={r.suggestions} minMargin={settings.min_margin} />}

      <section id="produtos-anunciados" className="scroll-mt-4 rounded-xl border border-line bg-surface">
        <h2 className="p-4 pb-0 font-semibold">Produtos anunciados</h2>
        {r.items === null ? (
          <p className="p-4 text-sm text-ink-2">
            O Mercado Livre não liberou as métricas por produto para a sua conta. Os números acima estão por campanha.
          </p>
        ) : (
          <>
            {r.items.length > 0 && <DecisionFilter items={r.items} active={filter} />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="p-3 font-medium">Anúncio</th>
                    <th className="p-3 font-medium">O que fazer</th>
                    <Metrics.Head />
                    <th
                      className="p-3 text-right font-medium"
                      title="Margem antes dos anúncios: acima desse ACOS (ou abaixo desse ROAS) a venda dá prejuízo"
                    >
                      Equilíbrio
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.items
                    .filter((i) => !filter || i.decision === filter)
                    .sort((a, b) => DECISION[a.decision].order - DECISION[b.decision].order || b.cost - a.cost)
                    .map((i) => (
                      <tr key={i.item_id} className="align-top">
                        <td className="p-3">
                          <div className="flex max-w-xs gap-2">
                            {i.thumbnail && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={i.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                            )}
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-medium">{i.title ?? i.item_id}</p>
                              <p className="text-xs text-muted">
                                {i.item_id}
                                {i.price != null ? ` · ${brl(i.price)}` : ""}
                                {i.stock != null ? ` · estoque ${int(i.stock)}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-xs p-3">
                          <SeverityBadge severity={DECISION[i.decision].severity} label={DECISION[i.decision].label} />
                          <p className="mt-1 text-ink-2">{i.reason}</p>
                        </td>
                        <Metrics.Cells t={i.totals} />
                        <td className="p-3 text-right tabular-nums">
                          {i.breakEvenAcos !== null ? (
                            <>
                              {i.breakEvenRoas !== null ? roas(i.breakEvenRoas) : "prejuízo"}
                              <p className="text-xs text-muted">ACOS {pct(Math.max(i.breakEvenAcos, 0))}</p>
                            </>
                          ) : (
                            <span className="text-muted">sem custo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!r.items.length && <p className="p-6 text-center text-sm text-ink-2">Nenhum produto anunciado no período.</p>}
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
        <h2 className="mb-2 font-semibold text-ink">Como ler</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>ACOS</strong>: quanto você gasta em anúncio para cada R$ 100 vendidos por ele. 10% = R$ 10 a cada R$ 100.
          </li>
          <li>
            <strong>ROAS</strong>: o contrário. 10x = R$ 10 vendidos para cada R$ 1 investido.
          </li>
          <li>
            <strong>TACOS</strong>: o investimento em anúncios dividido pelo faturamento total da loja, com e sem anúncio.
          </li>
          <li>
            <strong>ROAS objetivo</strong>: o retorno mínimo que você pede ao Mercado Livre em cada campanha (de 1x a 35x). Quanto maior,
            mais lucro por venda e menos exibições.
          </li>
          <li>
            <strong>Equilíbrio</strong>: o ROAS (ou ACOS) em que o anúncio empata. Vem da margem do produto antes do anúncio, então precisa
            do custo cadastrado. ROAS objetivo abaixo do equilíbrio autoriza o Mercado Livre a vender com prejuízo. A sugestão mira 65% da
            margem para o anúncio, deixando lucro.
          </li>
          <li>
            <strong>Exibições</strong>: a parte das buscas em que seus anúncios apareceram. A perda por <em>orçamento</em> se resolve com
            mais verba; a perda por <em>classificação</em>, com ROAS objetivo menor ou anúncio mais competitivo (preço, fotos, frete
            grátis).
          </li>
        </ul>
      </section>
    </div>
  );
}

const Metrics = {
  Head() {
    return (
      <>
        <th className="p-3 text-right font-medium">Investimento</th>
        <th className="p-3 text-right font-medium">Vendas</th>
        <th className="p-3 text-right font-medium">ACOS</th>
        <th className="p-3 text-right font-medium">ROAS</th>
        <th className="p-3 text-right font-medium">Cliques</th>
        <th className="p-3 text-right font-medium">CTR</th>
        <th className="p-3 text-right font-medium">CPC</th>
      </>
    );
  },
  Cells({ t }: { t: AdsTotals }) {
    return (
      <>
        <td className="p-3 text-right tabular-nums">{brl(t.cost)}</td>
        <td className="p-3 text-right tabular-nums">{brl(t.revenue)}</td>
        <td className="p-3 text-right tabular-nums">{opt(t.acos, (n) => pct(n))}</td>
        <td className="p-3 text-right tabular-nums">{opt(t.roas, roas)}</td>
        <td className="p-3 text-right tabular-nums">{int(t.clicks)}</td>
        <td className="p-3 text-right tabular-nums">{opt(t.ctr, (n) => pct(n, 2))}</td>
        <td className="p-3 text-right tabular-nums">{opt(t.cpc, brl)}</td>
      </>
    );
  },
};

function Diagnoses({ list }: { list: CampaignDiagnosis[] }) {
  return (
    <div className="space-y-1.5 rounded-md bg-bg p-2.5">
      {list.map((d) => (
        <div key={d.code} className="flex items-start gap-2">
          <SeverityBadge severity={d.severity} />
          <div>
            <span className="text-ink-2">{d.message}</span>
            {d.suggest && (
              <p className="mt-0.5 text-xs font-medium">
                Sugestão:{" "}
                {[
                  d.suggest.roasTarget !== undefined && `ROAS objetivo ${roas(d.suggest.roasTarget)}`,
                  d.suggest.budget !== undefined && `orçamento ${brl(d.suggest.budget)}/dia`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Contagem por decisão, que também filtra a lista (clicar de novo tira o filtro). */
function DecisionFilter({ items, active }: { items: { decision: AdDecision }[]; active: AdDecision | null }) {
  const counts = new Map<AdDecision, number>();
  for (const i of items) counts.set(i.decision, (counts.get(i.decision) ?? 0) + 1);
  const href = (d: AdDecision | null) => `/publicidade${d ? `?decisao=${d}` : ""}#produtos-anunciados`;
  const chip = (on: boolean) => `rounded-md border p-0.5 ${on ? "border-ink" : "border-transparent hover:border-line"}`;
  return (
    <nav aria-label="Filtrar por decisão" className="flex flex-wrap items-center gap-1.5 px-4 pt-2 text-xs">
      <Link
        href={href(null)}
        scroll={false}
        className={`${chip(!active)} px-2 py-1 font-medium`}
        aria-current={!active ? "true" : undefined}
      >
        Todos ({items.length})
      </Link>
      {(Object.keys(DECISION) as AdDecision[])
        .filter((d) => counts.get(d))
        .map((d) => (
          <Link
            key={d}
            href={href(active === d ? null : d)}
            scroll={false}
            className={chip(active === d)}
            aria-current={active === d ? "true" : undefined}
          >
            <SeverityBadge severity={DECISION[d].severity} label={`${counts.get(d)} ${DECISION[d].label.toLowerCase()}`} />
          </Link>
        ))}
    </nav>
  );
}
