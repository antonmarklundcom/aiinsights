import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authDisabled, verifySession } from "@/lib/auth";

/**
 * Optimistic auth gate (plan §5.3). Everything that is not exempt needs a valid
 * `ai_session` cookie or it is redirected to `/login?next=…`.
 *
 * This only reads the cookie — no database, no `env.ts` — because the proxy
 * runs on every request including prefetches, and in a restricted runtime.
 * It is deliberately not the last line of defence: server actions call
 * `requireSession()` themselves, which is what actually protects the data.
 */
const EXEMPT_PATHS: readonly RegExp[] = [
  /^\/login(?:\/|$)/,
  /^\/api\/telegram(?:\/|$)/,
  /^\/api\/cron(?:\/|$)/,
  /^\/_next(?:\/|$)/,
  /^\/favicon\.ico$/,
];

/** Paths that are reachable without a session. Exported for the unit test. */
export function isExempt(pathname: string): boolean {
  return EXEMPT_PATHS.some((pattern) => pattern.test(pathname));
}

let warnedAboutOpenDashboard = false;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (isExempt(pathname)) return NextResponse.next();

  if (authDisabled()) {
    if (!warnedAboutOpenDashboard) {
      warnedAboutOpenDashboard = true;
      console.warn(
        "[auth] DASHBOARD_PASSWORD is not set — the dashboard is open to anyone who can reach it. " +
          "Set it in .env to turn the login on. Production refuses to start without it."
      );
    }
    return NextResponse.next();
  }

  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.nextUrl);
  login.searchParams.set("next", `${pathname}${search}`);
  // 302, not `NextResponse.redirect`'s default 307: a 307 would replay an
  // unauthenticated server action's POST body against /login.
  return NextResponse.redirect(login, 302);
}

export const config = {
  /*
   * Everything except the static assets the proxy could never protect anyway.
   * The path exemptions above are applied in code rather than here: the matcher
   * has to be a build-time constant, `_next/data` requests reach the proxy even
   * when excluded, and a server action is a POST to the page it lives on — so a
   * matcher that skips a path silently skips its actions too.
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
