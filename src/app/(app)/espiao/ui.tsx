export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-2">{children}</p>;
}

export function Thumb({ src }: { src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="h-10 w-10 shrink-0 rounded bg-ink/5" />;
}
