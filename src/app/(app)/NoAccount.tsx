import Link from "next/link";

export function NoAccount() {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-xl font-semibold">Conecte sua conta do Mercado Livre</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Com a conta conectada, o Seller Hub acompanha vendas, perguntas, visitas e estoque em tempo real.
      </p>
      <Link href="/api/ml/connect" className="mt-5 inline-block rounded-md bg-accent px-4 py-2 font-medium text-white">
        Conectar Mercado Livre
      </Link>
    </div>
  );
}

/** Telas que por enquanto só existem para contas do Mercado Livre. */
export function OnlyMercadoLivre({ feature }: { feature: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-xl font-semibold">{feature} ainda não está disponível para a Shopee</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
        Por enquanto esta tela funciona com a conta do Mercado Livre. Troque de conta no seletor do topo para ver os dados dela.
      </p>
    </div>
  );
}
