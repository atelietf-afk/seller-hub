import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { PLATFORM_LABEL, PLATFORMS, TITLE_MAX, titleProblems, type Platform } from "@/lib/analytics/listings";
import * as catalog from "@/lib/data/catalog";
import { brl, dateOnly } from "@/lib/format";
import { currentAccount } from "@/lib/session";

// Anúncio de cada loja, pronto para copiar e colar. Nada é publicado daqui automaticamente.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { ownerId } = await currentAccount();
  const { id } = await params;
  const product = await catalog.productOf(ownerId, id);
  if (!product) notFound();
  const listings = await catalog.listingsOf(ownerId, id);
  const byPlatform = new Map(listings.map((l) => [l.platform, l]));
  const trends = listings[0]?.research?.trendKeywords ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/anuncios" className="text-sm text-ink-2 hover:underline">
          ← Anúncios
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{product.name}</h1>
        <p className="text-sm text-ink-2">
          {product.price != null ? brl(product.price) : "Sem preço"}
          {product.cost != null ? ` · custo ${brl(product.cost)}` : ""}
          {product.sku ? ` · SKU ${product.sku}` : ""} · cadastrado em {dateOnly(product.created_at)}
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5 text-sm">
        <h2 className="font-semibold">Pesquisa usada</h2>
        {trends.length ? (
          <>
            <p className="mt-1 text-ink-2">Buscas em alta no Mercado Livre nas categorias que você já vende:</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {trends.slice(0, 20).map((k) => (
                <span key={k} className="rounded bg-bg px-2 py-0.5 text-xs">
                  {k}
                </span>
              ))}
            </p>
          </>
        ) : (
          <p className="mt-1 text-ink-2">
            Sem tendências do Mercado Livre (ainda não há categoria sincronizada). Os textos foram feitos só com o seu cadastro.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Shopee e Amazon não oferecem busca pública de palavras. Por isso, nessas lojas, as palavras-chave são sugestões: confira no
          próprio app antes de usar.
        </p>
      </section>

      {PLATFORMS.map((p) => {
        const l = byPlatform.get(p as Platform);
        if (!l) return null;
        const problems = titleProblems(p as Platform, l.title);
        return (
          <section key={p} className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{PLATFORM_LABEL[p as Platform]}</h2>
              <span className={`text-xs ${problems.length ? "text-critical" : "text-muted"}`}>
                Título: {l.title.length}/{TITLE_MAX[p as Platform]}
              </span>
            </div>

            {problems.map((m) => (
              <p key={m} className="rounded-md bg-critical/10 p-2 text-xs text-critical">
                {m}
              </p>
            ))}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-2">Título</p>
                <CopyButton text={l.title} label="Copiar título" />
              </div>
              <p className="mt-1 text-sm">{l.title}</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-2">Descrição</p>
                <CopyButton text={l.description} label="Copiar descrição" />
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{l.description}</p>
            </div>

            {l.keywords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-ink-2">Palavras-chave</p>
                <p className="mt-1 text-sm">{l.keywords.join(", ")}</p>
              </div>
            )}

            {l.to_confirm.length > 0 && (
              <div className="rounded-md bg-warning/10 p-3 text-sm">
                <p className="font-medium">Confirme antes de publicar</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {l.to_confirm.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
