"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EventRow } from "@/lib/data/types";
import { SeverityBadge } from "./Severity";

const KIND_LABEL: Record<string, string> = { order: "Venda", question: "Pergunta", item_change: "Anúncio", alert: "Alerta" };
const POLL_MS = 15_000;

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : new Date(iso).toLocaleDateString("pt-BR");
}

// Central ao vivo: começa com os eventos do servidor e busca os novos a cada 15 s
// (e na hora em que a aba volta a ficar visível).
export function LiveFeed({ accountId, initial }: { accountId: string; initial: EventRow[] }) {
  const [events, setEvents] = useState(initial);
  const [online, setOnline] = useState(true);
  const latest = useRef(initial[0]?.created_at);
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const q = new URLSearchParams({ account: accountId });
      if (latest.current) q.set("after", latest.current);
      try {
        const res = await fetch(`/api/events?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const { events: fresh } = (await res.json()) as { events: EventRow[] };
        if (stopped) return;
        setOnline(true);
        if (fresh.length) {
          latest.current = fresh[0].created_at;
          setEvents((prev) => [...fresh, ...prev.filter((e) => !fresh.some((f) => f.id === e.id))].slice(0, 50));
          // Venda nova: recarrega os números do painel (vendas de hoje) sem perder a página.
          if (fresh.some((e) => e.kind === "order")) router.refresh();
        }
      } catch {
        if (!stopped) setOnline(false);
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [accountId, router]);

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className={`h-2 w-2 rounded-full ${online ? "bg-good" : "bg-muted"}`} aria-hidden />
        {online ? "Ao vivo · atualiza a cada 15 s" : "Sem conexão, tentando de novo…"}
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-ink-2">Nada por aqui ainda. Vendas, perguntas e alertas aparecem assim que acontecem.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className={`flex gap-3 py-2.5 ${e.read_at ? "opacity-70" : ""}`}>
              <SeverityBadge severity={e.severity} label={KIND_LABEL[e.kind] ?? e.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{e.title}</p>
                {e.body && <p className="truncate text-sm text-ink-2">{e.body}</p>}
              </div>
              <time className="shrink-0 text-xs text-muted" dateTime={e.created_at}>
                {ago(e.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
