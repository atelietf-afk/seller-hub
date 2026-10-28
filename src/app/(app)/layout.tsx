import Link from "next/link";
import { signOut } from "../actions";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { currentAccount } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Painel" },
  { href: "/produtos", label: "Produtos e funil" },
  { href: "/perguntas", label: "Perguntas" },
  { href: "/publicidade", label: "Publicidade" },
  { href: "/espiao", label: "Espião" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/configuracoes", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, account, accounts } = await currentAccount();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Seller Hub
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-ink-2">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            {account && accounts.length > 1 ? (
              <AccountSwitcher accounts={accounts} current={account.id} />
            ) : (
              <span className="hidden sm:inline">
                {account ? `${account.marketplace === "shopee" ? "Shopee" : "ML"}: ${account.nickname}` : user.email}
              </span>
            )}
            <form action={signOut}>
              <button className="hover:text-ink">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
