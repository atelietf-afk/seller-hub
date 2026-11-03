"use client";

import { useFormStatus } from "react-dom";

const STYLES = {
  default: "border border-line bg-surface hover:bg-bg",
  primary: "bg-accent text-white hover:opacity-90",
};

export function SubmitButton({
  children,
  pending,
  className = "",
  variant = "default",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  variant?: keyof typeof STYLES;
}) {
  const status = useFormStatus();
  return (
    <button disabled={status.pending} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${STYLES[variant]} ${className}`}>
      {status.pending ? (pending ?? "Aguarde…") : children}
    </button>
  );
}
