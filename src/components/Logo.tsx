import Image from "next/image";

// Logomarca Seller Hub Ideal: caixa + nome em texto (fica nítido e acompanha o modo claro/escuro).
// No modo escuro a caixa vai com o fundo azul-marinho do ícone, para não sumir no fundo escuro.
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  const px = big ? 56 : 36;
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/logo-box.png" alt="" width={px} height={px} priority className="dark:hidden" />
      <Image src="/logo-icon.png" alt="" width={px} height={px} priority className="hidden dark:block" />
      <span className="h-8 w-px bg-brand-navy/80 dark:bg-white/30" aria-hidden />
      <span className={`flex flex-col leading-none ${big ? "gap-1" : "gap-0.5"}`}>
        <span className={`font-extrabold tracking-tight text-brand-navy dark:text-white ${big ? "text-3xl" : "text-lg"}`}>
          Seller Hub <span className="italic text-brand-blue dark:text-brand-sky">Ideal</span>
        </span>
        <span className={`font-medium uppercase tracking-[0.14em] text-ink-2 ${big ? "text-xs" : "hidden text-[0.6rem] sm:block"}`}>
          Gestão de marketplaces
        </span>
      </span>
    </span>
  );
}
