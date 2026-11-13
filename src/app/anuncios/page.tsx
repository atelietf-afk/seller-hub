import Link from "next/link";
import { createProductAction } from "./actions";
import { Badge, ButtonLink, Card, Notice, SectionTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/analytics/listings";
import * as catalog from "@/lib/data/catalog";
import { brl, dateOnly } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const ERRORS: Record<string, string> = {
  dados: "Preencha o nome e a descrição do produto.",
  ia: "Não conseguimos gerar os anúncios agora. Tente de novo em alguns minutos.",
};

const inputClass = "mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";

// Lista de produtos: cadastro único. Cada produto gera o anúncio de cada loja.
export default async function AnunciosPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { ownerId } = await currentAccount();
  const { erro } = await searchParams;
  const products = await catalog.productsOf(ownerId);
  const sent = products.filter((p) => p.loja_integrada_id).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anúncios</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Cadastre o produto uma vez. O Seller Hub escreve o anúncio de cada loja ({PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(", ")}),
            com as regras de cada uma. Nada é publicado sem você revisar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/anuncios/video" variant="secondary">
            Editor de vídeo
          </ButtonLink>
          <ButtonLink href="#novo">+ Novo produto</ButtonLink>
        </div>
      </header>

      {erro && <Notice tone="critical">{ERRORS[erro] ?? erro}</Notice>}

      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Produtos" value={products.length} />
        <Stat label="Enviados à Loja Integrada" value={sent} />
        <Stat label="Ainda não enviados" value={products.length - sent} />
      </div>

      {products.length === 0 ? (
        <Card>
          <SectionTitle title="Nenhum produto ainda" hint="Comece cadastrando o primeiro produto. Leva menos de um minuto." />
          <ButtonLink href="#novo">+ Cadastrar produto</ButtonLink>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/anuncios/${p.id}`}
                className="block h-full space-y-3 rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{p.name}</p>
                  {p.loja_integrada_id ? <Badge tone="good">Na Loja Integrada</Badge> : <Badge>Rascunho</Badge>}
                </div>
                <p className="text-sm text-ink-2">
                  {p.price != null ? brl(p.price) : "Sem preço"}
                  {p.sku ? ` · SKU ${p.sku}` : ""}
                </p>
                <p className="text-xs text-muted">Cadastrado em {dateOnly(p.created_at)}</p>
                <span className="inline-block text-sm font-medium text-accent">Abrir →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details id="novo" open={products.length === 0 || !!erro} className="scroll-mt-24 rounded-xl border border-line bg-surface p-5">
        <summary className="cursor-pointer list-none text-base font-semibold">
          <span className="inline-flex items-center gap-2">+ Novo produto</span>
          <span className="ml-2 text-sm font-normal text-ink-2">clique para abrir ou fechar</span>
        </summary>
        <form action={createProductAction} className="mt-5 space-y-5">
          <div>
            <label className="block text-sm font-medium">
              Nome do produto
              <input name="name" required placeholder="Ex.: Caneca personalizada com nome" className={inputClass} />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium">
              O que você sabe sobre ele
              <textarea
                name="description"
                required
                rows={5}
                placeholder="Material, medidas, cores, o que vem na embalagem, personalização, tempo de produção, para quem é presente…"
                className={inputClass}
              />
              <span className="mt-1 block text-xs font-normal text-muted">
                Escreva só o que você confirma. A IA não inventa material, medida nem garantia.
              </span>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              Preço de venda (R$)
              <input name="price" inputMode="decimal" placeholder="89,90" className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              Custo (R$)
              <input name="cost" inputMode="decimal" placeholder="32,00" className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              SKU (opcional)
              <input name="sku" className={inputClass} />
            </label>
          </div>
          <SubmitButton variant="primary" pending="Gerando anúncios… leva alguns segundos">
            Gerar anúncios das lojas
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-ink-2">{label}</p>
    </div>
  );
}
