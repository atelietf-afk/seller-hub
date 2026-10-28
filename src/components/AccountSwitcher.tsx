"use client";

import { selectAccount } from "@/app/actions";

const LABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee" } as const;

// Troca a conta que as telas mostram (cada marketplace conectado é uma conta).
export function AccountSwitcher({
  accounts,
  current,
}: {
  accounts: { id: string; marketplace: keyof typeof LABEL; nickname: string | null }[];
  current: string;
}) {
  return (
    <form action={selectAccount}>
      <label className="sr-only" htmlFor="conta">
        Conta
      </label>
      <select
        id="conta"
        name="accountId"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {LABEL[a.marketplace]}: {a.nickname ?? "loja"}
          </option>
        ))}
      </select>
    </form>
  );
}
