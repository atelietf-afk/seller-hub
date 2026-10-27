import type { TodayOrder, TodaySales as Today } from "@/lib/analytics/today";
import { brl, change, int, pct } from "@/lib/format";
import { Kpi } from "./Kpi";
import { SeverityBadge } from "./Severity";

const STATUS: Record<string, { label: string; severity: "warning" | "critical" | "info" }> = {
  cancelled: { label: "Cancelada", severity: "critical" },
  pending_cancel: { label: "Cancelando", severity: "critical" },
  payment_required: { label: "Aguardando pagamento", severity: "warning" },
  payment_in_process: { label: "Pagamento em análise", severity: "warning" },
  partially_paid: { label: "Pago em parte", severity: "warning" },
  partially_refunded: { label: "Reembolso parcial", severity: "info" },
};

const MAX_ROWS = 15;
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// Vendas do dia no painel: totais de hoje contra ontem até o mesmo horário e a lista de pedidos.
export function TodaySales({ data, now }: { data: Today; now: Date }) {
  const t = data.today;
  const y = data.yesterday;
  const untilNow = `ontem até as ${hour(now.toISOString())}`;
  const missingCost = !t.hasCost ? "falta o custo de algum produto" : `margem ${pct(t.margin)}`;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Faturamento hoje" value={brl(t.revenue)} delta={change(t.revenue, y.revenue)} hint={`${untilNow}: ${brl(y.revenue)}`} />
        <Kpi label="Vendas hoje" value={int(t.orders)} delta={change(t.orders, y.orders)} hint={`${int(t.units)} unidades · ontem ${int(y.orders)}`} />
        <Kpi label="Lucro hoje" value={brl(t.profit)} delta={change(t.profit, y.profit)} hint={t.orders ? missingCost : untilNow} />
        <Kpi label="Ticket médio hoje" value={brl(t.avgTicket)} delta={change(t.avgTicket, y.avgTicket)} hint={`ontem ${brl(y.avgTicket)}`} />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">Vendas de hoje</h2>
        {data.orders.length === 0 ? (
          <p className="text-sm text-ink-2">Nenhuma venda ainda hoje. Elas aparecem aqui assim que o Mercado Livre avisa.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {data.orders.slice(0, MAX_ROWS).map((o) => (
                <OrderRow key={o.id} o={o} />
              ))}
            </ul>
            {data.orders.length > MAX_ROWS && (
              <p className="mt-2 text-xs text-muted">e mais {data.orders.length - MAX_ROWS} pedido(s) hoje.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function OrderRow({ o }: { o: TodayOrder }) {
  const first = o.lines[0];
  const status = STATUS[o.status];
  return (
    <li className={`flex items-center gap-3 py-2.5 text-sm ${o.counted ? "" : "opacity-70"}`}>
      <time className="w-11 shrink-0 tabular-nums text-muted" dateTime={o.time}>
        {hour(o.time)}
      </time>
      {first?.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-10 w-10 shrink-0 rounded bg-bg" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {first ? `${first.quantity}× ${first.title}` : `Pedido ${o.id}`}
          {o.lines.length > 1 && <span className="font-normal text-ink-2"> + {o.lines.length - 1} produto(s)</span>}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          {status && <SeverityBadge severity={status.severity} label={status.label} />}
          {o.counted && (
            <span className={o.profit < 0 ? "text-critical" : undefined}>
              lucro {brl(o.profit)}
              {!o.hasCost && " (sem custo)"}
            </span>
          )}
        </p>
      </div>
      <span className={`shrink-0 font-medium tabular-nums ${o.status === "cancelled" ? "text-muted line-through" : ""}`}>{brl(o.revenue)}</span>
    </li>
  );
}
