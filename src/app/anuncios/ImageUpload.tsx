"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

// Envia a foto do produto e atualiza a página. Mostra o erro da regra (tipo ou tamanho) se houver.
export function ImageUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <label className={`${buttonClass("primary")} ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Enviando foto…" : "+ Adicionar foto"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            const body = new FormData();
            body.set("productId", productId);
            body.set("file", file);
            const res = await fetch("/api/anuncios/imagens", { method: "POST", body });
            setBusy(false);
            e.target.value = "";
            if (!res.ok) {
              setError(((await res.json().catch(() => null)) as { erro?: string } | null)?.erro ?? "Não foi possível enviar a foto.");
              return;
            }
            router.refresh();
          }}
        />
      </label>
      <p className="text-xs text-muted">JPG, PNG ou WEBP, até 8 MB. A primeira foto é a principal.</p>
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
