import Link from "next/link";
import { acceptInviteAction } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { normalizeEmail, ROLE_HINT, ROLE_LABEL } from "@/lib/analytics/team";
import { inviteByToken } from "@/lib/data/team";
import { dateOnly } from "@/lib/format";
import { currentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  invalido: "Este convite não existe ou foi cancelado.",
  expirado: "Este convite venceu. Peça um novo para quem convidou você.",
  usado: "Este convite já foi usado.",
  "outro-email": "Este convite foi feito para outro e-mail. Entre com o e-mail convidado.",
  proprio: "Você não pode aceitar um convite para a sua própria equipe.",
};

// Convite para a equipe: a pessoa entra (ou cria a conta) com o e-mail convidado e aceita.
export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ erro?: string }> }) {
  const user = await currentUser();
  const { token } = await params;
  const { erro } = await searchParams;
  const invite = await inviteByToken(token);
  const problem =
    erro ??
    (!invite
      ? "invalido"
      : invite.accepted_at
        ? "usado"
        : new Date(invite.expires_at) <= new Date()
          ? "expirado"
          : normalizeEmail(user.email) !== invite.email
            ? "outro-email"
            : null);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold">Convite para a equipe</h1>
        {invite && (
          <p className="mt-2 text-sm text-ink-2">
            <strong>{invite.owner_email}</strong> convidou <strong>{invite.email}</strong> para acompanhar as lojas no Seller Hub com o perfil{" "}
            <strong>{ROLE_LABEL[invite.role]}</strong>: {ROLE_HINT[invite.role].toLowerCase()} Vale até {dateOnly(invite.expires_at)}.
          </p>
        )}
        {problem ? (
          <>
            <p className="mt-4 rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[problem] ?? ERRORS.invalido}</p>
            <p className="mt-3 text-sm text-ink-2">
              Você entrou como {user.email}.{" "}
              <Link href="/dashboard" className="text-accent">
                Ir para o painel
              </Link>
            </p>
          </>
        ) : (
          <form action={acceptInviteAction} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <SubmitButton variant="primary" pending="Entrando…">
              Aceitar convite
            </SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
