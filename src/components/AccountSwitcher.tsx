"use client";

import { selectAccount } from "@/app/actions";

// Troca a conta que as telas mostram (cada marketplace conectado é uma conta).
export function AccountSwitcher({
  accounts,
  current,
}: {
  accounts: { id: string; label: string }[];
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
            {a.label}
          </option>
        ))}
      </select>
    </form>
  );
}
