"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu principal com a aba atual destacada na cor da marca.
export function MainNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="border-t border-line bg-brand-navy">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 text-sm">
        {items.map((n) => {
          const active = path === n.href || path.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-b-2 px-2.5 py-2.5 ${active ? "border-brand-sky font-medium text-white" : "border-transparent text-white/70 hover:text-white"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
