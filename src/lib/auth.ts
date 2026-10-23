import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "./db";

// Login por e-mail e senha. Lê BETTER_AUTH_SECRET e BETTER_AUTH_URL do ambiente.
export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  plugins: [nextCookies()],
});
