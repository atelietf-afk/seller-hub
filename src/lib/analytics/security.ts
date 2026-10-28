// Regras de acesso ao Seller Hub (exigidas pela Amazon para liberar a SP-API):
// senha com 12+ caracteres, letra, número e caractere especial, trocada a cada 365 dias,
// e verificação em duas etapas (código do aplicativo autenticador) para todos.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_DAYS = 365;
const DAY = 86_400_000;

/** O que falta na senha, ou null se ela atende à regra. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (!/\p{L}/u.test(password)) return "A senha precisa ter pelo menos uma letra.";
  if (!/\d/.test(password)) return "A senha precisa ter pelo menos um número.";
  if (!/[^\p{L}\d\s]/u.test(password)) return "A senha precisa ter pelo menos um caractere especial (ex.: ! @ # $ %).";
  return null;
}

/** Senha nunca trocada pela regra nova (null) ou trocada há mais de 365 dias. */
export function passwordExpired(changedAt: Date | string | null | undefined, now: Date): boolean {
  if (!changedAt) return true;
  return now.getTime() - new Date(changedAt).getTime() > PASSWORD_MAX_DAYS * DAY;
}

/** Data em que a senha vence. */
export function passwordExpiresAt(changedAt: Date | string): Date {
  return new Date(new Date(changedAt).getTime() + PASSWORD_MAX_DAYS * DAY);
}

export type SecurityStep = "senha" | "duas-etapas";

/** Próximo passo obrigatório antes de usar o Seller Hub, ou null se está tudo em dia. */
export function pendingSecurityStep(
  user: { passwordChangedAt?: Date | string | null; twoFactorEnabled?: boolean | null },
  now: Date,
): SecurityStep | null {
  if (passwordExpired(user.passwordChangedAt, now)) return "senha";
  if (!user.twoFactorEnabled) return "duas-etapas";
  return null;
}

/** Códigos de recuperação têm traço (ex.: AbCd3-eFgH5); os do aplicativo são 6 dígitos. */
export function isBackupCode(code: string) {
  return !/^\d{6}$/.test(code.replace(/\s/g, ""));
}
