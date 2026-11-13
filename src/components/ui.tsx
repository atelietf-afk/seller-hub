import Link from "next/link";

// Componentes visuais do Seller Hub. As cores vêm dos tokens do globals.css (accent, surface, line...),
// então a identidade da loja entra trocando esses valores num único lugar.

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-bg",
  ghost: "text-ink-2 hover:text-ink",
};

export function buttonClass(variant: Variant = "primary") {
  return `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${VARIANT[variant]}`;
}

export function ButtonLink({ href, variant, children }: { href: string; variant?: Variant; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 space-y-4 rounded-xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
    </div>
  );
}

const BADGE: Record<"good" | "warning" | "muted", string> = {
  good: "bg-good/15 text-good",
  warning: "bg-warning/15 text-ink",
  muted: "bg-bg text-ink-2",
};

export function Badge({ tone = "muted", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Notice({ tone, children }: { tone: "good" | "critical" | "warning"; children: React.ReactNode }) {
  const style = {
    good: "border-good/40 bg-good/10 text-ink",
    critical: "border-critical/40 bg-critical/10 text-critical",
    warning: "border-warning/50 bg-warning/10 text-ink",
  }[tone];
  return <div className={`rounded-md border p-3 text-sm ${style}`}>{children}</div>;
}
