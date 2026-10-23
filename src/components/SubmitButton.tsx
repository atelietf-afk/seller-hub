"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending, className = "" }: { children: React.ReactNode; pending?: string; className?: string }) {
  const status = useFormStatus();
  return (
    <button
      disabled={status.pending}
      className={`rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-60 ${className}`}
    >
      {status.pending ? (pending ?? "Aguarde…") : children}
    </button>
  );
}
