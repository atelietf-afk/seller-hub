"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Envia a foto do produto e atualiza a página. Mostra o erro da regra (tipo ou tamanho) se houver.
export function ImageUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
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
        className="text-sm"
      />
      {busy && <p className="text-xs text-muted">Enviando…</p>}
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
