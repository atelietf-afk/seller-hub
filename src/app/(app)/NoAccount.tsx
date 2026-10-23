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
