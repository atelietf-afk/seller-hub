import { createHmac, timingSafeEqual } from "node:crypto";

// Assinatura dos avisos (push) da Shopee: HMAC-SHA256 hex de "url|corpo", com a partner key.

export function verifyPushSignature(url: string, body: string, partnerKey: string, authorization: string | null): boolean {
  if (!authorization) return false;
  const expected = createHmac("sha256", partnerKey).update(`${url}|${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(authorization.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Código do aviso de nova mensagem de comprador (chat). Não existe para o tipo de app ERP System. */
export const PUSH_CHAT = 10;
