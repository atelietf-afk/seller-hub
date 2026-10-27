import Link from "next/link";
import { draftAllAction, draftAnswerAction, sendAnswerAction } from "../../actions";
import { NoAccount } from "../NoAccount";
import { SeverityBadge } from "@/components/Severity";
import { SubmitButton } from "@/components/SubmitButton";
import { ANSWER_MAX, waitingSeverity } from "@/lib/analytics/answers";
import { settingsOf } from "@/lib/data/accounts";
import { pendingQuestions, recentlyAnswered } from "@/lib/data/questions";
import { brl, int } from "@/lib/format";
import { currentAccount } from "@/lib/session";

const ERRORS: Record<string, string> = {
  ia: "Não conseguimos gerar a sugestão agora. Tente de novo em alguns minutos.",
  respondida: "Essa pergunta já foi respondida ou removida no Mercado Livre.",
  ml: "O Mercado Livre não aceitou a resposta agora. Tente de novo em alguns minutos.",
  empty: "A resposta está vazia.",
  too_long: `A resposta passa de ${ANSWER_MAX} caracteres.`,
  phone: "A resposta parece ter um telefone. O Mercado Livre proíbe dados de contato.",
  email: "A resposta tem um e-mail. O Mercado Livre proíbe dados de contato.",
  link: "A resposta tem um link ou site. O Mercado Livre proíbe.",
  social: "A resposta cita WhatsApp ou rede social. O Mercado Livre proíbe.",
  marcador: "Complete os trechos entre colchetes [ ] antes de enviar.",
};

const CONFIDENCE = {
  alta: { severity: "success", label: "Confiança alta" },
  media: { severity: "warning", label: "Revise" },
  baixa: { severity: "critical", label: "Falta informação" },
} as const;

function waited(iso: string) {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ erro?: string; q?: string; enviada?: string }> }) {
  const { user, account } = await currentAccount();
  if (!account) return <NoAccount />;
  const { erro, q: errQ, enviada } = await searchParams;
  const [pending, answered, settings] = await Promise.all([
    pendingQuestions(user.id, account.id),
    recentlyAnswered(user.id, account.id),
    settingsOf(user.id),
  ]);
  const withoutDraft = pending.filter((q) => !q.draft).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Perguntas</h1>
          <p className="text-sm text-ink-2">
            {pending.length ? `${int(pending.length)} sem resposta, da mais antiga para a mais nova.` : "Nenhuma pergunta esperando."} A IA
            sugere; você revisa e envia.
          </p>
        </div>
        {withoutDraft > 0 && (
          <form action={draftAllAction} className="ml-auto">
            <SubmitButton pending="Gerando sugestões…">Sugerir para {Math.min(withoutDraft, 10)} pergunta(s)</SubmitButton>
          </form>
        )}
      </div>

      {!settings.store_info && (
        <p className="rounded-md bg-warning/20 p-3 text-sm">
          Dica: preencha as <Link href="/configuracoes" className="underline">informações da loja</Link> (prazo de envio, garantia, nota
          fiscal, trocas) para a IA responder essas dúvidas sem precisar perguntar a você.
        </p>
      )}
      {enviada && <p className="rounded-md bg-good/10 p-3 text-sm">Resposta enviada ao Mercado Livre.</p>}
      {erro && ERRORS[erro] && !errQ && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[erro]}</p>}

      {pending.map((q) => {
        const sev = waitingSeverity(q.date_created);
        const conf = q.draft ? CONFIDENCE[q.draft.confidence] : null;
        return (
          <section key={q.id} id={`q-${q.id}`} className="scroll-mt-4 rounded-xl border border-line bg-surface p-4">
            <div className="flex gap-3">
              {q.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded bg-ink/5" />
              )}
              <div className="min-w-0 flex-1">
                <a href={q.permalink ?? "#"} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm text-ink-2 hover:underline">
                  {q.title ?? q.item_id}
                </a>
                <p className="text-xs text-muted">
                  {q.price != null ? brl(q.price) : ""}
                  {q.available_quantity != null ? ` · ${int(q.available_quantity)} em estoque` : ""}
                </p>
              </div>
              <SeverityBadge severity={sev} label={waited(q.date_created)} />
            </div>
            <p className="mt-3 rounded-lg bg-bg p-3 text-sm">“{q.text}”</p>

            {erro && ERRORS[erro] && errQ === String(q.id) && <p className="mt-2 text-sm text-critical">{ERRORS[erro]}</p>}

            <form action={sendAnswerAction} className="mt-3 space-y-2">
              <input type="hidden" name="questionId" value={q.id} />
              {conf && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <SeverityBadge severity={conf.severity} label={conf.label} />
                  {q.draft!.missing.length > 0 && <span className="text-ink-2">Falta: {q.draft!.missing.join(", ")}</span>}
                </div>
              )}
              <textarea
                name="answer"
                rows={4}
                maxLength={ANSWER_MAX}
                defaultValue={q.draft?.answer ?? ""}
                placeholder="Escreva a resposta ou peça uma sugestão à IA."
                aria-label={`Resposta para: ${q.text}`}
                className="block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {/* O mesmo formulário também pede sugestão: por isso o texto de espera é neutro. */}
                <SubmitButton pending="Aguarde…" variant="primary">
                  Enviar ao Mercado Livre
                </SubmitButton>
                <button formAction={draftAnswerAction} className="rounded-md border border-line px-3 py-1.5 text-sm">
                  {q.draft ? "Sugerir de novo" : "Sugerir resposta com IA"}
                </button>
              </div>
            </form>
          </section>
        );
      })}

      {answered.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Respondidas por aqui recentemente</h2>
          <ul className="divide-y divide-line text-sm">
            {answered.map((a) => (
              <li key={a.id} className="py-2">
                <p className="text-xs text-muted">
                  {a.title} · {new Date(a.answered_at).toLocaleString("pt-BR")}
                </p>
                <p className="text-ink-2">“{a.text}”</p>
                <p>{a.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
