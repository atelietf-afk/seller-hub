import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/canonical";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/ml/notifications", "/api/cron"];

// Checagem rápida: sem cookie de sessão, vai para /login. A validação de verdade
// acontece no servidor (src/lib/session.ts) em cada página e ação.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const canonical = canonicalRedirect({
    host: request.headers.get("host"),
    path,
    search: request.nextUrl.search,
    vercelEnv: process.env.VERCEL_ENV,
    canonicalUrl: process.env.BETTER_AUTH_URL,
  });
  if (canonical) return NextResponse.redirect(canonical, 308);
  if (PUBLIC_PATHS.some((p) => path.startsWith(p)) || getSessionCookie(request)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
