"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SeverityBadge, type Severity } from "./Severity";

export interface FeedEvent {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}

const KIND_LABEL: Record<string, string> = { order: "Venda", question: "Pergunta", item_change: "Anúncio", alert: "Alerta" };

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : new Date(iso).toLocaleDateString("pt-BR");
}

// Central ao vivo: começa com os eventos do servidor e recebe os novos pelo Supabase Realtime.
export function LiveFeed({ accountId, initial }: { accountId: string; initial: FeedEvent[] }) {
  const [events, setEvents] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = createClient();
    const channel = db
      .channel(`events:${accountId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `account_id=eq.${accountId}` },
        (payload) => setEvents((prev) => [payload.new as FeedEvent, ...prev].slice(0, 50)),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [accountId]);

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className={`h-2 w-2 rounded-full ${live ? "bg-good" : "bg-muted"}`} aria-hidden />
        {live ? "Ao vivo" : "Conectando…"}
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
