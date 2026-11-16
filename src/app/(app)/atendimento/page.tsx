import Link from "next/link";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { MARKETPLACE_LABEL } from "@/lib/marketplaces";
import { inboxOf } from "@/lib/data/inbox";
import { accountsOfOwners } from "@/lib/data/accounts";
import { currentAccount } from "@/lib/session";
import { dateTime } from "@/lib/format";

// Caixa de atendimento: o que está esperando resposta, em todas as lojas.
// Mensagens de cliente (chat) só entram quando a API da loja estiver liberada.
export default async function AtendimentoPage() {
  const { ownerId } = await currentAccount();
  const [questions, all] = await Promise.all([inboxOf(ownerId), accountsOfOwners([ownerId])]);
  const byStore = new Map<string, number>();
  for (const q of questions) byStore.set(q.account_id, (byStore.get(q.account_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Atendimento</h1>
        <p className="mt-1 text-sm text-ink-2">Tudo o que espera resposta nas suas lojas, em ordem de chegada. Responda em Perguntas.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {all.map((a) => (
          <Card key={a.id} className="space-y-1 p-4">
            <p className="text-xs text-ink-2">{MARKETPLACE_LABEL[a.marketplace]}</p>
            <p className="font-semibold">{a.nickname ?? "loja"}</p>
            {a.marketplace === "mercadolivre" ? (
              <p className="text-sm">{byStore.get(a.id) ?? 0} pergunta(s) esperando</p>
            ) : (
              <Badge>Chat ainda não integrado</Badge>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle title="Perguntas pendentes" hint={`${questions.length} no total`} />
        {questions.length === 0 ? (
          <p className="text-sm text-ink-2">Nada esperando resposta. Ótimo.</p>
        ) : (
          <ul className="divide-y divide-line">
            {questions.map((q) => (
              <li key={q.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                  <span>
                    {q.store ?? "loja"} · {q.title ?? "anúncio"}
                  </span>
                  <span>{dateTime(q.date_created)}</span>
                </div>
                <p className="text-sm">{q.text}</p>
                <Link href="/perguntas" className="text-sm font-medium text-accent">
                  Responder →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle title="Canais" hint="O que cada loja permite hoje." />
        <ul className="space-y-2 text-sm">
          <li>
            <strong>Mercado Livre:</strong> perguntas integradas, com resposta pelo Seller Hub.
          </li>
          <li>
            <strong>Shopee:</strong> o chat com compradores não tem API pública confirmada. O app ainda está em análise, então não é
            possível testar.
          </li>
          <li>
            <strong>TikTok Shop:</strong> aguardando a aprovação da loja.
          </li>
          <li>
            <strong>Amazon:</strong> o app ainda não tem a função de mensagens liberada.
          </li>
        </ul>
      </Card>
    </div>
  );
}
