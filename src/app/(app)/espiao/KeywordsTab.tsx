import { suggestItemTitles } from "../../actions";
import { Empty, Thumb } from "./ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ML_TITLE_MAX } from "@/lib/ai/titles";
import { competitorTermGaps, trendGaps } from "@/lib/analytics/keywords";
import { bestSellersFor, ownActiveItems, titleSuggestionsFor, trendsFor } from "@/lib/data/spy";
import { brl } from "@/lib/format";

export async function KeywordsTab({ ownerId, accountId }: { ownerId: string; accountId: string }) {
  const items = await ownActiveItems(ownerId, accountId, 30);
  const cats = [...new Set(items.map((i) => i.category_id).filter((c): c is string => !!c))];
  const [trends, best, suggestions] = await Promise.all([trendsFor(cats), bestSellersFor(cats), titleSuggestionsFor(ownerId, accountId)]);
  if (!trends.length && !best.length) {
    return <Empty>Ainda não temos dados das suas categorias. Clique em Sincronizar no Painel e volte em alguns minutos.</Empty>;
  }
  const sugg = new Map(suggestions.map((s) => [s.item_id, s]));

  const rows = items.map((i) => {
    const t = trends.filter((x) => x.category_id === i.category_id);
    const b = best.filter((x) => x.category_id === i.category_id && x.title).map((x) => x.title!);
    return { item: i, trends: trendGaps(i.title, t, 6), terms: competitorTermGaps(i.title, b, 0.3, 6), hasData: t.length + b.length > 0 };
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Seus 30 anúncios que mais faturam. Para cada um: <strong>buscas em alta</strong> na categoria que o título não cobre e{" "}
        <strong>termos que os mais vendidos usam</strong> e você não. Só use um termo se ele for verdadeiro para o seu produto.
      </p>
      {rows.map(({ item, trends, terms, hasData }) => {
        const s = sugg.get(item.id);
        return (
          <section key={item.id} id={item.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex gap-3">
              <Thumb src={item.thumbnail} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.id} · {brl(item.price)} · {item.title.length}/{ML_TITLE_MAX} caracteres
                </p>
              </div>
            </div>
            {!hasData ? (
              <p className="mt-3 text-sm text-ink-2">Sem dados desta categoria ainda.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted">Buscas em alta que o título não cobre</p>
                  <Chips list={trends.map((t) => ({ label: t.keyword, hint: `#${t.position}` }))} empty="O título já cobre as buscas em alta relacionadas." />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Termos dos mais vendidos que faltam</p>
                  <Chips
                    list={terms.map((t) => ({ label: t.term, hint: `${Math.round(t.share * 100)}% usam` }))}
                    empty="Seu título já usa os termos comuns dos mais vendidos."
                  />
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3">
              <form action={suggestItemTitles}>
                <input type="hidden" name="itemId" value={item.id} />
                <SubmitButton pending="Gerando…">{s ? "Gerar de novo" : "Sugerir títulos com IA"}</SubmitButton>
              </form>
              {s && (
                <ol className="min-w-0 flex-1 space-y-2 text-sm">
                  {s.content.titles.map((t) => (
                    <li key={t.title}>
                      <p className="font-medium">
                        {t.title} <span className="text-xs font-normal text-muted">({t.title.length}/{ML_TITLE_MAX})</span>
                      </p>
                      <p className="text-ink-2">{t.why}</p>
                      {t.verify.length > 0 && <p className="text-xs text-critical">Confirme antes de usar: {t.verify.join(", ")}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Chips({ list, empty }: { list: { label: string; hint: string }[]; empty: string }) {
  if (!list.length) return <p className="mt-1 text-sm text-ink-2">{empty}</p>;
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5">
      {list.map((c) => (
        <li key={c.label} className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-sm">
          {c.label} <span className="text-xs text-muted">{c.hint}</span>
        </li>
      ))}
    </ul>
  );
}
