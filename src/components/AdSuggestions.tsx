import { STRATEGY_LABEL, type CampaignSuggestion, type SuggestionResult } from "@/lib/analytics/ad-suggestions";
import { brl, dateOnly, int, pct } from "@/lib/format";
import Link from "next/link";
import { CreateCampaignForm } from "./CampaignControls";
import { CopyButton } from "./CopyButton";

const x = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;

// Campanhas novas sugeridas, com tudo o que o Mercado Ads pede para criar.
export function AdSuggestions({
  result,
  minMargin,
  existing,
  writeEnabled,
}: {
  result: SuggestionResult;
  minMargin: number;
  existing: Set<string>;
  writeEnabled: boolean;
}) {
  const { suggestions, skipped } = result;
  return (
    <section id="sugestoes" className="scroll-mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-semibold">Campanhas sugeridas</h2>
        <p className="text-sm text-ink-2">
          Montadas com a margem real dos seus produtos. Copie os valores para criar a campanha no Mercado Livre.
        </p>
      </div>

      <details className="rounded-md bg-bg p-3 text-sm">
        <summary className="cursor-pointer font-medium">Como criar no Mercado Ads</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
          <li>
            {writeEnabled ? (
              <>
                Clique em <strong>Criar no Mercado Livre</strong> (ou crie em Publicidade → Product Ads com os dados do card).
              </>
            ) : (
              <>
                No Mercado Livre, abra Publicidade → Product Ads e crie uma campanha com os dados do card (botão{" "}
                <strong>Copiar dados da campanha</strong>).
              </>
            )}
          </li>
          <li>
            Adicione os anúncios pelos códigos (botão <strong>Copiar códigos</strong>). Os marcados como <strong>Mover</strong> saem da
            campanha em que estão hoje.
          </li>
          <li>Volte na data de revisão: o Mercado Livre leva até 14 dias para atribuir as vendas ao anúncio.</li>
        </ol>
      </details>

      {suggestions.length === 0 ? (
        <p className="text-sm text-ink-2">Nenhuma campanha nova para sugerir agora. Seus anúncios com margem já estão em campanhas.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {suggestions.map((s) => (
            <Card key={s.kind} s={s} created={existing.has(s.name)} writeEnabled={writeEnabled} />
          ))}
        </div>
      )}

      {(skipped.noCost > 0 || skipped.lowMargin > 0 || skipped.outOfStock > 0) && (
        <ul className="space-y-1 text-xs text-muted">
          {skipped.noCost > 0 && (
            <li>
              {int(skipped.noCost)} anúncio(s) fora de campanha sem custo cadastrado.{" "}
              <Link href="/produtos" className="text-accent">
                Cadastre o custo
              </Link>{" "}
              para entrarem nas sugestões.
            </li>
          )}
          {skipped.lowMargin > 0 && (
            <li>
              {int(skipped.lowMargin)} anúncio(s) com margem abaixo de {pct(Math.max(minMargin, 0.05), 0)}: anunciar daria prejuízo.
            </li>
          )}
          {skipped.outOfStock > 0 && <li>{int(skipped.outOfStock)} anúncio(s) sem estoque.</li>}
        </ul>
      )}
    </section>
  );
}

function Card({ s, created, writeEnabled }: { s: CampaignSuggestion; created: boolean; writeEnabled: boolean }) {
  const review = dateOnly(s.reviewAt);
  const moving = s.items.filter((i) => i.action === "mover").length;
  return (
    <article className="min-w-0 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-accent">{STRATEGY_LABEL[s.strategy]}</p>
          <h3 className="font-semibold">{s.name}</h3>
        </div>
        <CopyButton text={s.name} label="Copiar nome" />
      </div>
      <p className="mt-1 text-sm text-ink-2">{s.why}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Field label="Estratégia" value={STRATEGY_LABEL[s.strategy]} />
        <Field label="ROAS objetivo" value={x(s.roasTarget)} hint={`equilíbrio ${x(s.breakEvenRoas)}`} />
        <Field label="Orçamento diário" value={brl(s.budget)} hint={`~${int(s.clicksPerDay)} cliques/dia`} />
        <Field label="Revisar em" value={review} hint={`${s.reviewDays} dias`} />
      </dl>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        {created ? (
          <p className="rounded-md bg-good/10 px-2 py-1 text-sm text-good">
            ✓ Campanha já existe. Confira os anúncios dela no Mercado Ads.
          </p>
        ) : !writeEnabled ? (
          <CopyButton
            text={`Nome: ${s.name}\nEstratégia: ${STRATEGY_LABEL[s.strategy]}\nOrçamento diário: ${brl(s.budget)}\nROAS objetivo: ${x(s.roasTarget)}`}
            label="Copiar dados da campanha"
          />
        ) : (
          <CreateCampaignForm kind={s.kind} name={s.name} budget={s.budget} roasTarget={s.roasTarget} breakEvenRoas={s.breakEvenRoas} />
        )}
        <CopyButton text={s.items.map((i) => i.itemId).join(", ")} label="Copiar códigos dos anúncios" />
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-sm font-medium">
          {s.items.length} anúncio(s){moving > 0 && <span className="font-normal text-ink-2"> · {moving} para mover</span>}
        </summary>
        <ul className="mt-2 divide-y divide-line text-sm">
          {s.items.map((i) => (
            <li key={i.itemId} className="flex items-start gap-2 py-2">
              {i.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded bg-bg" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate">{i.title}</p>
                <p className="text-xs text-muted">
                  {i.itemId} · {brl(i.price)} · margem {pct(i.margin ?? 0, 0)}
                  {i.marginEstimated ? " (estimada)" : ""}
                </p>
                <span
                  className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs ${i.action === "mover" ? "bg-warning/25" : "bg-good/10 text-good"}`}
                >
                  {i.action === "mover" ? `Mover de ${i.campaignName}` : "Novo"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-bg p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}
