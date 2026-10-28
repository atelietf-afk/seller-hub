"use client";

import { useState } from "react";

// Copia um texto para colar no Mercado Livre (nome da campanha, códigos dos anúncios).
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copie o texto:", text);
        }
      }}
      className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium hover:bg-bg"
    >
      {copied ? "Copiado ✓" : label}
    </button>
  );
}
