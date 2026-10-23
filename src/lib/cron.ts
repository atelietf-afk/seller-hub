import "server-only";

// A Vercel envia "Authorization: Bearer <CRON_SECRET>" nas chamadas agendadas.
export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}
