import { signIn, signUp } from "../actions";

const ERRORS: Record<string, string> = {
  credenciais: "E-mail ou senha incorretos.",
  "link-invalido": "O link expirou ou já foi usado. Entre com sua senha.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; aviso?: string }> }) {
  const { erro, aviso } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Seller Hub</h1>
      <p className="mt-1 text-sm text-ink-2">Tudo o que acontece na sua loja, em um só lugar.</p>
      {erro && <p className="mt-4 rounded-md bg-critical/10 p-3 text-sm text-critical">{ERRORS[erro] ?? erro}</p>}
      {aviso === "confirme-email" && (
        <p className="mt-4 rounded-md bg-good/10 p-3 text-sm">Conta criada. Confirme pelo link que enviamos ao seu e-mail.</p>
      )}
      <form className="mt-6 space-y-3 rounded-xl border border-line bg-surface p-5">
        <label className="block text-sm">
          E-mail
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="block text-sm">
          Senha
          <input name="password" type="password" required minLength={8} autoComplete="current-password" className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <button formAction={signIn} className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white">
          Entrar
        </button>
        <button formAction={signUp} className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink-2">
          Criar conta
        </button>
      </form>
    </main>
  );
}
