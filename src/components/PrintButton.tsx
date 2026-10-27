"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
      Imprimir / salvar PDF
    </button>
  );
}
