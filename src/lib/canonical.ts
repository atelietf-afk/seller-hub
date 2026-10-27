// Endereço oficial: em produção, quem abrir o app por um domínio *.vercel.app
// é mandado para o domínio próprio (BETTER_AUTH_URL). Rotas /api ficam de fora
// para não quebrar cron, webhooks e o retorno do OAuth.
export function canonicalRedirect(opts: {
  host: string | null;
  path: string;
  search: string;
  vercelEnv: string | undefined;
  canonicalUrl: string | undefined;
}): string | null {
  const { host, path, search, vercelEnv, canonicalUrl } = opts;
  if (vercelEnv !== "production" || !host || !canonicalUrl) return null;
  if (path === "/api" || path.startsWith("/api/")) return null;
  let target: URL;
  try {
    target = new URL(canonicalUrl);
  } catch {
    return null;
  }
  const hostname = host.split(":")[0].toLowerCase();
  if (!hostname.endsWith(".vercel.app") || hostname === target.hostname) return null;
  return `${target.origin}${path}${search}`;
}
