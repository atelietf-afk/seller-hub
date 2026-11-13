import Link from "next/link";
import { notFound } from "next/navigation";
import { publishInstagramAction, publishInstagramCarouselAction, publishLojaIntegradaAction, resendPhotosAction } from "../actions";
import { ImageUpload } from "../ImageUpload";
import { Badge, Card, Notice, SectionTitle, buttonClass } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { PLATFORM_LABEL, PLATFORMS, TITLE_MAX, titleProblems, type Platform } from "@/lib/analytics/listings";
import { instagramConfigured, publicImageUrl } from "@/lib/instagram";
import { lojaIntegradaConfigured } from "@/lib/lojaintegrada/client";
import { priceBody, productBody, sendProblems, stockBody } from "@/lib/lojaintegrada/payload";
import { imagesOf } from "@/lib/data/images";
import * as catalog from "@/lib/data/catalog";
import { brl, dateOnly } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const IG_MESSAGES: Record<string, string> = {
  publicado: "Post publicado no Instagram.",
  confirme: "Marque a caixa de confirmação antes de publicar.",
};

const LI_MESSAGES: Record<string, string> = {
  enviado: "Produto enviado à Loja Integrada, inativo e sem estoque. Revise no painel antes de ativar.",
  "fotos-reenviadas": "As fotos que faltavam foram enviadas à Loja Integrada.",
  "nenhuma-foto-faltando": "A Loja Integrada já tem todas as fotos deste produto.",
  confirme: "Marque a caixa de confirmação antes de enviar.",
};

const inputClass = "mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";

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
  const product = await catalog.productOf(ownerId, id);
  if (!product) notFound();
  const [images, listings] = await Promise.all([imagesOf(ownerId, id), catalog.listingsOf(ownerId, id)]);
  const byPlatform = new Map(listings.map((l) => [l.platform, l]));
  const trends = listings[0]?.research?.trendKeywords ?? [];
  const sent = !!product.loja_integrada_id;
  const sendInput = { name: product.name, description: product.description, sku: product.sku, price: product.price, cost: product.cost };
  // o SKU é preenchido no próprio formulário de envio, então a mensagem só aparece se o campo não estiver lá
  const problems = sendProblems(sendInput).filter((m) => product.sku || !m.includes("SKU"));
  const hashtags = "#artesanal #ateliê #presente";

  return (
    <div className="space-y-6">
      <nav className="text-sm text-ink-2">
        <Link href="/anuncios" className="hover:text-ink">
          ← Todos os produtos
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span>{product.price != null ? brl(product.price) : "Sem preço"}</span>
            {product.cost != null && <span>· custo {brl(product.cost)}</span>}
            {product.sku && <span>· SKU {product.sku}</span>}
            <span>· cadastrado em {dateOnly(product.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sent ? (
              <Badge tone="good">Na Loja Integrada (id {product.loja_integrada_id})</Badge>
            ) : (
              <Badge>Não enviado à Loja Integrada</Badge>
            )}
            <Badge>
              {images.length} {images.length === 1 ? "foto" : "fotos"}
            </Badge>
            <Badge>
              {listings.length} de {PLATFORMS.length} anúncios
            </Badge>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <a href="#fotos" className={buttonClass("secondary")}>
            Fotos e Instagram
          </a>
          <a href="#loja-integrada" className={buttonClass("secondary")}>
            Loja Integrada
          </a>
          <a href="#anuncios" className={buttonClass("secondary")}>
            Anúncios
          </a>
        </nav>
      </header>

      {ig && <Notice tone={ig === "publicado" ? "good" : "critical"}>{IG_MESSAGES[ig] ?? ig}</Notice>}
      {li && (
        <Notice tone={li === "enviado" || li === "fotos-reenviadas" || li === "nenhuma-foto-faltando" ? "good" : "critical"}>
          {LI_MESSAGES[li] ?? li}
        </Notice>
      )}

      {/* 1. FOTOS E INSTAGRAM */}
      <Card id="fotos">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="1. Fotos e Instagram"
            hint="As fotos ficam num endereço público do Seller Hub. É desse endereço que a Loja Integrada e o Instagram baixam a imagem."
          />
          <ImageUpload productId={product.id} />
        </div>

        {images.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-ink-2">
            Nenhuma foto ainda. Adicione a primeira acima.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, index) => (
              <li key={img.id} className="space-y-3 rounded-lg border border-line bg-bg p-3">
                <div className="flex items-center justify-between">
                  <Badge tone={index === 0 ? "good" : "muted"}>{index === 0 ? "Principal" : `Foto ${index + 1}`}</Badge>
                  <CopyButton text={publicImageUrl(img.id, img.content_type)} label="Copiar link" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto do próprio produto, servida pela rota pública */}
                <img src={`/api/imagens/${img.id}`} alt={product.name} className="h-44 w-full rounded-md bg-surface object-contain" />
                {instagramConfigured() ? (
                  <details className="rounded-md border border-line bg-surface p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Publicar esta foto no Instagram</summary>
                    <form action={publishInstagramAction} className="mt-3 space-y-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <textarea name="caption" rows={4} defaultValue={`${product.name}\n\n${hashtags}`} className={inputClass} />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="confirmo" /> Confirmo a publicação desta foto e desta legenda
                      </label>
                      <button className={buttonClass("primary")}>Publicar no Instagram</button>
                    </form>
                  </details>
                ) : (
                  <p className="text-xs text-muted">Instagram ainda não configurado no servidor.</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {instagramConfigured() && images.length >= 2 && (
          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">Publicar um carrossel (de 2 a 10 fotos)</summary>
            <form action={publishInstagramCarouselAction} className="mt-4 space-y-3">
              <input type="hidden" name="productId" value={product.id} />
              <p className="text-xs text-ink-2">Marque as fotos que entram no carrossel. Ele segue a ordem da galeria acima.</p>
              <div className="flex flex-wrap gap-3">
                {images.map((img, index) => (
                  <label key={img.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm">
                    <input type="checkbox" name="fotos" value={img.id} /> Foto {index + 1}
                  </label>
                ))}
              </div>
              <textarea name="caption" rows={3} defaultValue={`${product.name}\n\n${hashtags}`} className={inputClass} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="confirmo" /> Confirmo a publicação do carrossel no Instagram
              </label>
              <button className={buttonClass("primary")}>Publicar carrossel</button>
            </form>
          </details>
        )}
      </Card>

      {/* 2. LOJA INTEGRADA */}
      <Card id="loja-integrada">
        <SectionTitle
          title="2. Loja Integrada"
          hint="Envia o produto para a sua loja. Ele entra inativo e sem estoque, para você revisar antes de vender."
        />

        {sent ? (
          <div className="space-y-3">
            <Notice tone="good">
              Este produto já está na Loja Integrada (id {product.loja_integrada_id}). Alterações você faz pelo painel de lá.
            </Notice>
            <form action={resendPhotosAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="productId" value={product.id} />
              <button className={buttonClass("secondary")}>Reenviar fotos que faltaram</button>
              <span className="text-xs text-ink-2">Envia só as fotos que a loja ainda não tem.</span>
            </form>
          </div>
        ) : (
          <>
            <ol className="grid gap-2 text-sm sm:grid-cols-4">
              {[
                { ok: !!product.name && !!product.description, label: "Nome e descrição" },
                { ok: product.price != null && product.price > 0, label: "Preço de venda" },
                { ok: !!product.sku, label: "SKU" },
                { ok: images.length > 0, label: "Pelo menos uma foto" },
              ].map((step) => (
                <li key={step.label} className="flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2">
                  <span className={step.ok ? "text-good" : "text-critical"}>{step.ok ? "✓" : "!"}</span>
                  {step.label}
                </li>
              ))}
            </ol>

            {problems.map((m) => (
              <Notice key={m} tone="critical">
                {m}
              </Notice>
            ))}

            {lojaIntegradaConfigured() ? (
              <form action={publishLojaIntegradaAction} className="space-y-4 rounded-lg border border-line p-4">
                <input type="hidden" name="productId" value={product.id} />
                {!product.sku && (
                  <label className="block text-sm font-medium">
                    SKU (código do produto, obrigatório)
                    <input name="sku" required placeholder="Ex.: CAN-001" className={inputClass} />
                  </label>
                )}
                <label className="block text-sm font-medium">
                  Categoria na loja (opcional)
                  <input name="categoria" placeholder="Ex.: Camisetas" className={inputClass} />
                  <span className="mt-1 block text-xs font-normal text-muted">
                    Se a categoria não existir, ela é criada. Sem categoria, você escolhe depois no painel.
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmo" /> Confirmo o envio deste produto à Loja Integrada
                </label>
                <button className={buttonClass("primary")}>Enviar à Loja Integrada</button>
              </form>
            ) : (
              <p className="text-sm text-ink-2">A Loja Integrada ainda não está configurada no servidor.</p>
            )}

            <details className="rounded-md border border-line p-3 text-xs">
              <summary className="cursor-pointer font-medium">Ver o que será enviado</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify({ produto: productBody(sendInput), preco: priceBody(sendInput), estoque: stockBody(0) }, null, 2)}
              </pre>
            </details>
          </>
        )}
      </Card>

      {/* 3. ANÚNCIOS POR LOJA */}
      <section id="anuncios" className="scroll-mt-24 space-y-4">
        <SectionTitle
          title="3. Anúncio de cada loja"
          hint="Copie o título e a descrição para a loja. Cada loja tem o seu limite e as suas regras."
        />
        {PLATFORMS.map((p) => {
          const l = byPlatform.get(p as Platform);
          if (!l) {
            return (
              <Card key={p}>
                <p className="text-sm text-ink-2">{PLATFORM_LABEL[p as Platform]}: sem anúncio gerado.</p>
              </Card>
            );
          }
          const platformProblems = titleProblems(p as Platform, l.title);
          return (
            <Card key={p}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{PLATFORM_LABEL[p as Platform]}</h3>
                <Badge tone={platformProblems.length ? "warning" : "good"}>
                  Título {l.title.length}/{TITLE_MAX[p as Platform]}
                </Badge>
              </div>

              {platformProblems.map((m) => (
                <Notice key={m} tone="critical">
                  {m}
                </Notice>
              ))}

              <div className="space-y-2 rounded-lg border border-line bg-bg p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Título</p>
                  <CopyButton text={l.title} label="Copiar título" />
                </div>
                <p className="text-sm font-medium">{l.title}</p>
              </div>

              <details className="rounded-lg border border-line p-4">
                <summary className="cursor-pointer text-sm font-semibold">Descrição</summary>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-end">
                    <CopyButton text={l.description} label="Copiar descrição" />
                  </div>
                  <p className="whitespace-pre-line text-sm">{l.description}</p>
                </div>
              </details>

              {l.keywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Palavras-chave</p>
                  <p className="mt-1 text-sm">{l.keywords.join(", ")}</p>
                </div>
              )}

              {l.to_confirm.length > 0 && (
                <Notice tone="warning">
                  <p className="font-semibold">Confirme antes de publicar</p>
                  <ul className="mt-1 list-disc pl-5">
                    {l.to_confirm.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </Notice>
              )}
            </Card>
          );
        })}
      </section>

      {/* 4. PESQUISA */}
      <Card>
        <SectionTitle title="4. Pesquisa usada" hint="Buscas em alta no Mercado Livre, nas categorias que você já vende." />
        {trends.length ? (
          <div className="flex flex-wrap gap-1.5">
            {trends.slice(0, 20).map((k) => (
              <span key={k} className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-xs">
                {k}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-2">Sem tendências do Mercado Livre ainda. Os textos foram feitos só com o seu cadastro.</p>
        )}
        <p className="text-xs text-muted">
          Shopee e Amazon não oferecem busca pública de palavras. Nessas lojas, as palavras-chave são sugestões: confira no próprio app.
        </p>
      </Card>
    </div>
  );
}
