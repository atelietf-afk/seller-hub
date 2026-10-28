import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { PASSWORD_MIN } from "./analytics/security";
import { pool } from "./db";

// Login por e-mail e senha + verificação em duas etapas (aplicativo autenticador).
// Lê BETTER_AUTH_SECRET e BETTER_AUTH_URL do ambiente. As regras de senha ficam em analytics/security.
export const auth = betterAuth({
  appName: "Seller Hub",
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: 128 },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  user: { additionalFields: { passwordChangedAt: { type: "date", required: false, input: false } } },
  // As tabelas são criadas pelas migrações no deploy (db/migrations). Sem isto, cada
  // início a frio consulta o esquema antes do login e falha quando o Neon está acordando.
  advanced: { database: { validateSchema: false } },
  plugins: [twoFactor({ issuer: "Seller Hub" }), nextCookies()],
});
