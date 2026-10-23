import { pct } from "@/lib/format";

export function Kpi({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">
        {delta != null && (
          <span className={delta >= 0 ? "text-good" : "text-critical"}>
            {delta >= 0 ? "▲" : "▼"} {pct(Math.abs(delta))}{" "}
          </span>
        )}
        {hint}
      </p>
    </div>
  );
}
