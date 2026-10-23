// Cor de status sempre acompanhada de ícone e texto (nunca só a cor).
const STYLES = {
  success: { icon: "✓", label: "Bom", cls: "text-good bg-good/10" },
  info: { icon: "i", label: "Info", cls: "text-ink-2 bg-ink/5" },
  warning: { icon: "!", label: "Atenção", cls: "text-ink bg-warning/25" },
  critical: { icon: "!!", label: "Urgente", cls: "text-critical bg-critical/10" },
} as const;

export type Severity = keyof typeof STYLES;

export function SeverityBadge({ severity, label }: { severity: Severity; label?: string }) {
  const s = STYLES[severity];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {label ?? s.label}
    </span>
  );
}
