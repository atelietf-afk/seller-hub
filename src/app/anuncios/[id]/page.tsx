import Link from "next/link";
import { notFound } from "next/navigation";
import { publishInstagramAction, publishLojaIntegradaAction, resendPhotosAction } from "../actions";
import { lojaIntegradaConfigured } from "@/lib/lojaintegrada/client";
import { priceBody, productBody, sendProblems, stockBody } from "@/lib/lojaintegrada/payload";
import { ImageUpload } from "../ImageUpload";
import { CopyButton } from "@/components/CopyButton";
import { instagramConfigured, publicImageUrl } from "@/lib/instagram";
import { imagesOf } from "@/lib/data/images";
import { PLATFORM_LABEL, PLATFORMS, TITLE_MAX, titleProblems, type Platform } from "@/lib/analytics/listings";
import * as catalog from "@/lib/data/catalog";
import { brl, dateOnly } from "@/lib/format";
import { currentAccount } from "@/lib/session";

// Anúncio de cada loja, pronto para copiar e colar. Nada é publicado daqui automaticamente.
const IG_MESSAGES: Record<string, string> = {
  publicado: "Post publicado no Instagram.",
  confirme: "Marque a caixa para confirmar a publicação.",
};

const LI_MESSAGES: Record<string, string> = {
  enviado: "Produto enviado à Loja Integrada, inativo e sem estoque. Revise no painel antes de ativar.",
  "fotos-reenviadas": "Fotos que faltavam foram enviadas à Loja Integrada.",
  "nenhuma-foto-faltando": "A Loja Integrada já tem todas as fotos deste produto.",
  confirme: "Marque a caixa para confirmar o envio.",
};

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ig?: string; li?: string }>;
}) {
  const { ig, li } = await searchParams;
  const { ownerId } = await currentAccount();
  const { id } = await params;
  const images = await imagesOf(ownerId, id);
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

      <section id="instagram" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Fotos e Instagram</h2>
        <p className="text-sm text-ink-2">
          Envie a foto do produto. Ela fica num endereço público do Seller Hub, e é desse endereço que o Instagram baixa a imagem.
        </p>
        <ImageUpload productId={product.id} />
        {images.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {images.map((img) => (
              <li key={img.id} className="space-y-2 rounded-md border border-line p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto do próprio produto, servida pela rota pública */}
                <img src={`/api/imagens/${img.id}`} alt={product.name} className="h-40 w-full rounded object-cover" />
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{publicImageUrl(img.id, img.content_type)}</span>
                  <CopyButton text={publicImageUrl(img.id, img.content_type)} label="Copiar link" />
                </div>
                {instagramConfigured() ? (
                  <form action={publishInstagramAction} className="space-y-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <textarea
                      name="caption"
                      rows={4}
                      defaultValue={`${product.name}\n\n#artesanal #ateliê #presente`}
                      className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="confirmo" /> Confirmo que quero publicar esta foto e esta legenda no Instagram
                    </label>
                    <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">Publicar no Instagram</button>
                  </form>
                ) : (
                  <p className="text-xs text-muted">Instagram ainda não configurado no servidor.</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {ig && (
          <p className={`rounded-md p-3 text-sm ${ig === "publicado" ? "bg-good/10" : "bg-critical/10 text-critical"}`}>
            {IG_MESSAGES[ig] ?? ig}
          </p>
        )}
      </section>

      <section id="loja-integrada" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Enviar à Loja Integrada</h2>
        {product.loja_integrada_id ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              Já enviado (id {product.loja_integrada_id}). Para alterar, faça no painel da Loja Integrada.
            </p>
            <form action={resendPhotosAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button className="rounded-md border border-line px-3 py-1.5 text-sm font-medium">Reenviar fotos que faltaram</button>
              <p className="mt-1 text-xs text-muted">Envia só as fotos que a Loja Integrada ainda não tem.</p>
            </form>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-2">
              O produto entra <strong>inativo</strong> e com estoque zerado. Você revisa e ativa no painel. Sem medidas e sem peso: esses
              dados você completa lá. As fotos desta página vão junto, na ordem em que foram enviadas (a primeira é a principal).
            </p>
            <details className="rounded-md border border-line p-3 text-xs">
              <summary className="cursor-pointer font-medium">Ver o que será enviado</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    produto: productBody({
                      name: product.name,
                      description: product.description,
                      sku: product.sku,
                      price: product.price,
                      cost: product.cost,
                    }),
                    preco: priceBody({
                      name: product.name,
                      description: product.description,
                      sku: product.sku,
                      price: product.price,
                      cost: product.cost,
                    }),
                    estoque: stockBody(0),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            {sendProblems({
              name: product.name,
              description: product.description,
              sku: product.sku,
              price: product.price,
              cost: product.cost,
            })
              // o SKU é preenchido no próprio formulário de envio, então a mensagem só aparece sem o campo
              .filter((m) => product.sku || !m.includes("SKU"))
              .map((m) => (
                <p key={m} className="rounded-md bg-critical/10 p-2 text-xs text-critical">
                  {m}
                </p>
              ))}
            {lojaIntegradaConfigured() ? (
              <form action={publishLojaIntegradaAction} className="space-y-2">
                <input type="hidden" name="productId" value={product.id} />
                {!product.sku && (
                  <label className="block text-sm">
                    SKU (código do produto, obrigatório)
                    <input
                      name="sku"
                      required
                      placeholder="Ex.: CAN-001"
                      className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
                    />
                  </label>
                )}
                <label className="block text-sm">
                  Categoria na loja (opcional)
                  <input
                    name="categoria"
                    placeholder="Ex.: Camisetas"
                    className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-muted">
                    Se a categoria não existir, ela é criada. Sem categoria, o produto fica sem categoria até você escolher no painel.
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="confirmo" /> Confirmo o envio deste produto à Loja Integrada
                </label>
                <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">Enviar à Loja Integrada</button>
              </form>
            ) : (
              <p className="text-xs text-muted">Loja Integrada ainda não configurada no servidor.</p>
            )}
          </>
        )}
        {li && (
          <p className={`rounded-md p-3 text-sm ${li === "enviado" ? "bg-good/10" : "bg-critical/10 text-critical"}`}>
            {LI_MESSAGES[li] ?? li}
          </p>
        )}
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
