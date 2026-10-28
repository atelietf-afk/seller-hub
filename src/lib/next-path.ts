// Para onde voltar depois do login. Só aceita a página de convite: qualquer outro
// destino (outro site, //host, javascript:) vira o painel.
export function safeNext(raw: unknown): string | null {
  return typeof raw === "string" && /^\/convite\/[A-Za-z0-9_-]{10,100}$/.test(raw) ? raw : null;
}
