import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { signToken, verifyToken, safeReturnPath } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d desk session — staff stay signed in; silently re-bridged after

const COOKIE = { httpOnly: true, secure: true, sameSite: "lax", path: "/api/sso" } as const;

// Cross-domain SSO bridge, step 2. Served on the travelgenix.io desk domain.
// Verifies the handoff token AND that its `state` matches the sso_state cookie
// set by /api/sso/login — binding the round-trip to this browser (anti replay +
// login-CSRF) and making the handoff effectively single-use. Then mints the
// desk's own signed, HttpOnly session cookie.
export async function GET(request: NextRequest) {
  if (!env.authSessionSecret || !env.appBaseUrl) {
    return new NextResponse("SSO is not configured.", { status: 503 });
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  const claims = verifyToken(request.nextUrl.searchParams.get("token") ?? "", env.authSessionSecret, Date.now(), "handoff");
  const stateCookie = request.cookies.get("sso_state")?.value;

  // A handoff token is short-lived (seconds) and single-use. The common reason a
  // *signed-in* staff member lands here with a dead token is harmless: their desk
  // session lapsed and the silent re-bridge raced the clock, or they refreshed /
  // back-buttoned onto an old callback URL. Don't dead-end them on an error —
  // restart the handshake once and they sail straight back in. A one-shot cookie
  // guards against an infinite loop: if a *freshly* minted token still fails, the
  // problem is systemic (e.g. a rotated secret), so surface the error instead.
  if (!claims || !claims.state || !stateCookie || claims.state !== stateCookie) {
    const retried = request.cookies.get("sso_retry")?.value === "1";
    if (!retried) {
      const res = NextResponse.redirect(`${env.appBaseUrl}/api/sso/login?return=${encodeURIComponent(returnTo)}`);
      res.cookies.set("sso_retry", "1", { ...COOKIE, maxAge: 120 });
      return res;
    }
    const res = new NextResponse("Sign-in link invalid or expired — please try again.", { status: 401 });
    res.cookies.set("sso_retry", "", { ...COOKIE, maxAge: 0 });
    return res;
  }

  const session = signToken(
    { email: claims.email, name: claims.name, exp: Date.now() + SESSION_TTL_MS, aud: "session" },
    env.authSessionSecret,
  );
  const res = NextResponse.redirect(`${env.appBaseUrl}${returnTo}`);
  res.cookies.set("desk_session", session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  res.cookies.set("sso_state", "", { ...COOKIE, maxAge: 0 }); // consume the nonce
  res.cookies.set("sso_retry", "", { ...COOKIE, maxAge: 0 }); // clear the loop guard
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
