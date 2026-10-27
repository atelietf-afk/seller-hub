import Link from "next/link";
import { NoAccount } from "../NoAccount";
import { BestSellersTab } from "./BestSellersTab";
import { CatalogTab } from "./CatalogTab";
import { CompetitorsTab } from "./CompetitorsTab";
import { KeywordsTab } from "./KeywordsTab";
import { spyStatus } from "@/lib/data/spy";
import { currentAccount } from "@/lib/session";

const TABS = [
  { id: "palavras", label: "Palavras-chave" },
  { id: "mais-vendidos", label: "Mais vendidos" },
  { id: "catalogo", label: "Catálogo" },
  { id: "concorrentes", label: "Concorrentes" },
] as const;

const ERRORS: Record<string, string> = {
  link: "Não reconhecemos esse link. Cole o link do anúncio (com MLB-…) ou o código, ex.: MLB1234567890.",
  "nao-encontrado": "Não encontramos esse anúncio no Mercado Livre. Confira o link.",
  proprio: "Esse anúncio é seu. Aqui você acompanha concorrentes.",
  limite: "Você chegou ao limite de 50 concorrentes. Remova algum para adicionar outro.",
  ia: "Não conseguimos gerar as sugestões agora. Tente de novo em alguns minutos.",
};

export default async function SpyPage({ searchParams }: { searchParams: Promise<{ aba?: string; erro?: string }> }) {
  const { user, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const { aba, erro } = await searchParams;
  const tab = TABS.find((t) => t.id === aba)?.id ?? "palavras";
  const status = await spyStatus(user.id, account.id);
  const r = status?.spy_result;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Espião</h1>
        <p className="text-sm text-ink-2">
          O que os compradores buscam, o que os mais vendidos fazem e o que seus concorrentes mudam. Atualiza a cada sincronização.
        </p>
        <p className="mt-1 text-xs text-muted">
          {status?.spy_synced_at
            ? `Última atualização: ${new Date(status.spy_synced_at).toLocaleString("pt-BR")}` +
              (r
                ? ` · ${r.categories} categorias` +
                  (r.trends != null && r.refreshed > 0 ? ` (${r.trends} buscas em alta, ${r.bestSellers} mais vendidos recebidos)` : "") +
                  ` · ${r.catalog} anúncios no catálogo · ${r.competitors} concorrentes`
                : "")
            : "Ainda não atualizado: clique em Sincronizar agora no Painel."}
        </p>
        {r && r.errors.length > 0 && (
          <details className="mt-1 text-xs text-critical">
            <summary>Algumas partes não puderam ser atualizadas ({r.errors.length})</summary>
            <ul className="list-disc pl-5">
              {r.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/espiao?aba=${t.id}`}
            className={`shrink-0 rounded-md px-3 py-1.5 ${t.id === tab ? "bg-accent text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {erro && ERRORS[erro] && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[erro]}</p>}

      {tab === "palavras" && <KeywordsTab ownerId={user.id} accountId={account.id} />}
      {tab === "mais-vendidos" && <BestSellersTab ownerId={user.id} accountId={account.id} mlUserId={Number(account.ml_user_id)} />}
      {tab === "catalogo" && <CatalogTab ownerId={user.id} accountId={account.id} />}
      {tab === "concorrentes" && <CompetitorsTab ownerId={user.id} accountId={account.id} />}
    </div>
  );
}
