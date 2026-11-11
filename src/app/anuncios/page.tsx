import Link from "next/link";
import { createProductAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/analytics/listings";
import * as catalog from "@/lib/data/catalog";
import { dateOnly, brl } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const ERRORS: Record<string, string> = {
  dados: "Preencha o nome e a descrição do produto.",
  ia: "Não conseguimos gerar os anúncios agora. Tente de novo em alguns minutos.",
};

// Cadastro único: o que é o produto. Os anúncios de cada loja saem daqui.
export default async function AnunciosPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { ownerId } = await currentAccount();
  const { erro } = await searchParams;
  const products = await catalog.productsOf(ownerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Anúncios</h1>
        <p className="text-sm text-ink-2">
          Cadastre o produto uma vez. O Seller Hub escreve o anúncio de cada loja ({PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(", ")}) com
          as regras de cada uma e as buscas em alta do Mercado Livre. Nada é publicado sem você revisar.
        </p>
      </div>

      {erro && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[erro] ?? erro}</p>}

      <form action={createProductAction} className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Novo produto</h2>
        <label className="block text-sm">
          Nome do produto
          <input
            name="name"
            required
            placeholder="Ex.: Caneca personalizada com nome"
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Descrição do que você sabe sobre ele
          <textarea
            name="description"
            required
            rows={5}
            placeholder="Material, medidas, cores, o que vem na embalagem, personalização, tempo de produção, para quem é presente…"
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
          />
          <span className="mt-1 block text-xs text-muted">Só o que você confirma: a IA não inventa material, medida nem garantia.</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Preço de venda (R$)
            <input
              name="price"
              inputMode="decimal"
              placeholder="89,90"
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Custo (R$)
            <input
              name="cost"
              inputMode="decimal"
              placeholder="32,00"
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            SKU (opcional)
            <input name="sku" className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2" />
          </label>
        </div>
        <SubmitButton variant="primary" pending="Gerando anúncios… leva alguns segundos">
          Gerar anúncios das lojas
        </SubmitButton>
      </form>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Produtos cadastrados</h2>
        {!products.length && <p className="mt-2 text-sm text-ink-2">Nenhum produto ainda.</p>}
        <ul className="mt-3 divide-y divide-line text-sm">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/anuncios/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <span className="text-xs text-muted">
                {p.price != null ? brl(p.price) : "sem preço"} · {dateOnly(p.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
