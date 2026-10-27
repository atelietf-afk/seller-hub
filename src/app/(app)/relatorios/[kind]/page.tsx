import { notFound, redirect } from "next/navigation";

// Link do botão do WhatsApp: /relatorios/weekly-2026-10-19 → /relatorios/weekly/2026-10-19.
export default async function ReportLink({ params }: { params: Promise<{ kind: string }> }) {
  const m = /^(weekly|monthly)-(\d{4}-\d{2}-\d{2})$/.exec((await params).kind);
  if (!m) notFound();
  redirect(`/relatorios/${m[1]}/${m[2]}`);
}
