import Link from "next/link";
import { verifyLoginCode } from "../../actions";
import { safeNext } from "@/lib/next-path";

// Segunda etapa do login: o código de 6 dígitos do aplicativo autenticador.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ erro?: string; next?: string }> }) {
  const { erro, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Verificação em duas etapas</h1>
      <p className="mt-1 text-sm text-ink-2">Abra o aplicativo autenticador no celular e digite o código do Seller Hub.</p>
      {erro && (
        <p className="mt-4 rounded-md bg-critical/10 p-3 text-sm text-critical">
          Código incorreto ou vencido. Se o erro continuar, entre de novo com e-mail e senha.
        </p>
      )}
      <form action={verifyLoginCode} className="mt-6 space-y-3 rounded-xl border border-line bg-surface p-5">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="block text-sm">
          Código
          <input
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            maxLength={20}
            placeholder="123456"
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-lg tracking-widest"
          />
        </label>
        <button className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white">Confirmar</button>
        <p className="text-xs text-muted">Sem o celular? Use um dos códigos de recuperação que você guardou ao ativar a verificação.</p>
      </form>
      <Link href="/login" className="mt-4 text-center text-sm text-ink-2">
        Voltar para o login
      </Link>
    </main>
  );
}
