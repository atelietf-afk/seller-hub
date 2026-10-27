import { syncNow } from "../../actions";
import { NoAccount } from "../NoAccount";
import { AdsChart } from "@/components/AdsChart";
import { Kpi } from "@/components/Kpi";
import { SeverityBadge } from "@/components/Severity";
import { SubmitButton } from "@/components/SubmitButton";
import type { AdDiagnosis, AdsTotals } from "@/lib/analytics/ads";
import { buildAdsReport } from "@/lib/ads-report";
import { brl, dateTime, int, pct } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const STATUS_LABEL: Record<string, string> = { active: "Ativa", paused: "Pausada", idle: "Ociosa", hold: "Retida" };
const opt = (n: number | null, f: (n: number) => string) => (n === null ? "—" : f(n));
const roas = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;

export default async function AdsPage() {
  const { user, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const r = await buildAdsReport(user.id, account.id);
  if (!r) return <NoAccount />;
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
                <Metrics.Head />
                <th className="p-3 font-medium">Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.campaigns.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="p-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {STATUS_LABEL[c.status ?? ""] ?? c.status ?? "—"}
                      {c.acos_target ? ` · ACOS alvo ${pct(c.acos_target)}` : ""}
                    </p>
                  </td>
                  <td className="p-3 text-right tabular-nums">{c.budget != null ? brl(c.budget) : "—"}</td>
                  <Metrics.Cells t={c.totals} />
                  <td className="p-3">
                    <Diagnoses list={c.diagnoses} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.campaigns.length && <p className="p-6 text-center text-sm text-ink-2">Nenhuma campanha encontrada.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="p-4 pb-0 font-semibold">Produtos anunciados</h2>
        {r.items === null ? (
          <p className="p-4 text-sm text-ink-2">
            O Mercado Livre não liberou as métricas por produto para a sua conta. Os números acima estão por campanha.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="p-3 font-medium">Anúncio</th>
                  <Metrics.Head />
                  <th className="p-3 text-right font-medium" title="Margem antes dos anúncios: acima disso a venda dá prejuízo">
                    ACOS de equilíbrio
                  </th>
                  <th className="p-3 font-medium">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.items.map((i) => (
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
                          </p>
                        </div>
                      </div>
                    </td>
                    <Metrics.Cells t={i.totals} />
                    <td className="p-3 text-right tabular-nums">
                      {i.breakEvenAcos !== null ? pct(Math.max(i.breakEvenAcos, 0)) : <span className="text-muted">sem custo</span>}
                    </td>
                    <td className="p-3">
                      <Diagnoses list={i.diagnoses} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!r.items.length && <p className="p-6 text-center text-sm text-ink-2">Nenhum produto anunciado no período.</p>}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
        <h2 className="mb-2 font-semibold text-ink">Como ler</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>ACOS</strong>: quanto você gasta em anúncio para cada R$ 100 vendidos por ele. 10% = R$ 10 a cada R$ 100.</li>
          <li><strong>ROAS</strong>: o contrário. 10x = R$ 10 vendidos para cada R$ 1 investido.</li>
          <li><strong>TACOS</strong>: o investimento em anúncios dividido pelo faturamento total da loja, com e sem anúncio.</li>
          <li>
            <strong>ACOS de equilíbrio</strong>: é a margem do produto antes do anúncio. Se o ACOS passar dele, cada venda pelo anúncio dá
            prejuízo. Precisa do custo do produto cadastrado.
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

function Diagnoses({ list }: { list: AdDiagnosis[] }) {
  return (
    <div className="space-y-1">
      {list.map((d) => (
        <div key={d.code} className="flex items-start gap-2">
          <SeverityBadge severity={d.severity} />
          <span className="text-ink-2">{d.message}</span>
        </div>
      ))}
    </div>
  );
}
