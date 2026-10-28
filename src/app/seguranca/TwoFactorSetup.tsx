"use client";

import { useActionState } from "react";
import { confirmTwoFactor, startTwoFactor, type TwoFactorSetupState } from "../actions";
import { CopyButton } from "@/components/CopyButton";

// Ativação da verificação em duas etapas: senha → QR code + códigos de recuperação → primeiro código.
export function TwoFactorSetup() {
  const [started, start, starting] = useActionState<TwoFactorSetupState, FormData>(startTwoFactor, {});
  const [confirmed, confirm, confirming] = useActionState<TwoFactorSetupState, FormData>(confirmTwoFactor, {});
  const setup = started.qr ? started : null;

  if (!setup) {
    return (
      <form action={start} className="space-y-3">
        <p className="text-sm text-ink-2">
          Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy). Para começar, confirme sua
          senha.
        </p>
        {started.error && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{started.error}</p>}
        <label className="block text-sm">
          Senha atual
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
          />
        </label>
        <button disabled={starting} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {starting ? "Gerando…" : "Continuar"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">1. No aplicativo, toque em adicionar (+) e leia este QR code</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora (data URL) */}
        <img
          src={setup.qr}
          alt="QR code para o aplicativo autenticador"
          width={220}
          height={220}
          className="mt-2 rounded-md border border-line bg-white"
        />
        <p className="mt-2 text-xs text-muted">
          Não consegue ler? Escolha “inserir chave de configuração” e digite: <code className="break-all font-mono">{setup.secret}</code>
        </p>
      </div>
      <div>
        <p className="text-sm font-medium">2. Guarde os códigos de recuperação</p>
        <p className="text-xs text-muted">Cada um vale uma vez e serve para entrar se você perder o celular. Eles não aparecem de novo.</p>
        <pre className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-line bg-bg p-3 font-mono text-sm">
          {setup.backupCodes?.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </pre>
        <div className="mt-2">
          <CopyButton text={setup.backupCodes?.join("\n") ?? ""} label="Copiar códigos" />
        </div>
      </div>
      <form action={confirm} className="space-y-3">
        <p className="text-sm font-medium">3. Digite o código de 6 dígitos que aparece no aplicativo</p>
        {confirmed.error && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{confirmed.error}</p>}
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          placeholder="123456"
          className="w-40 rounded-md border border-line bg-bg px-3 py-2 text-lg tracking-widest"
        />
        <div>
          <button disabled={confirming} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {confirming ? "Confirmando…" : "Ativar verificação"}
          </button>
        </div>
      </form>
    </div>
  );
}
