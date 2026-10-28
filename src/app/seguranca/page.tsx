import Link from "next/link";
import { changePasswordAction, signOut } from "../actions";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { PASSWORD_MIN, passwordExpiresAt, pendingSecurityStep } from "@/lib/analytics/security";
import { dateOnly } from "@/lib/format";
import { signedInUser } from "@/lib/session";

const OK: Record<string, string> = {
  senha: "Senha trocada. As outras sessões abertas foram encerradas.",
  "duas-etapas": "Verificação em duas etapas ativada. A partir de agora o login pede o código do aplicativo.",
};

// Segurança da conta: troca de senha (obrigatória a cada 365 dias) e verificação em duas etapas
// (obrigatória para todos). Enquanto faltar algo, o resto do Seller Hub manda para cá.
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await signedInUser();
  const { erro, ok } = await searchParams;
  const step = pendingSecurityStep(user, new Date());
  const changedAt = user.passwordChangedAt;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Segurança da conta</h1>
        <form action={signOut}>
          <button className="text-sm text-ink-2">Sair</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

      {ok && OK[ok] && <p className="mt-4 rounded-md bg-good/10 p-3 text-sm">{OK[ok]}</p>}
      {erro && <p className="mt-4 rounded-md bg-critical/10 p-3 text-sm text-critical">{erro}</p>}

      {step && (
        <p className="mt-4 rounded-md bg-ink/5 p-3 text-sm">
          Para proteger os dados das suas lojas, o Seller Hub exige senha forte trocada uma vez por ano e verificação em duas etapas.
          {step === "senha" ? " Primeiro, crie uma senha nova." : " Falta ativar a verificação em duas etapas."}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Senha</h2>
        {step !== "senha" && changedAt && (
          <p className="mt-1 text-sm text-ink-2">
            Trocada em {dateOnly(changedAt)}. Vence em {dateOnly(passwordExpiresAt(changedAt))}.
          </p>
        )}
        {step === "senha" && !changedAt && (
          <p className="mt-1 text-sm text-ink-2">Sua senha é anterior à regra nova e precisa ser trocada.</p>
        )}
        {step === "senha" && changedAt && <p className="mt-1 text-sm text-ink-2">Sua senha venceu (mais de 365 dias). Crie uma nova.</p>}
        <form action={changePasswordAction} className="mt-4 space-y-3">
          <label className="block text-sm">
            Senha atual
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Nova senha
            <input
              name="newPassword"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
            <span className="mt-1 block text-xs text-muted">
              Pelo menos {PASSWORD_MIN} caracteres, com letra, número e caractere especial (ex.: ! @ # $ %).
            </span>
          </label>
          <label className="block text-sm">
            Confirme a nova senha
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
          </label>
          <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Trocar senha</button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Verificação em duas etapas</h2>
        {user.twoFactorEnabled ? (
          <p className="mt-1 text-sm text-ink-2">Ativa. O login pede o código do aplicativo autenticador.</p>
        ) : step === "senha" ? (
          <p className="mt-1 text-sm text-ink-2">Disponível depois de trocar a senha.</p>
        ) : (
          <div className="mt-3">
            <TwoFactorSetup />
          </div>
        )}
      </section>

      {!step && (
        <Link href="/dashboard" className="mt-6 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">
          Ir para o painel
        </Link>
      )}
    </main>
  );
}
