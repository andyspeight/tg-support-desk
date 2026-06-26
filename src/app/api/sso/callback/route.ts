import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { signToken, verifyToken, safeReturnPath } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h desk session; re-bridged after

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
  if (!claims) {
    return new NextResponse("Sign-in link invalid or expired — please try again.", { status: 401 });
  }
  const stateCookie = request.cookies.get("sso_state")?.value;
  if (!claims.state || !stateCookie || claims.state !== stateCookie) {
    return new NextResponse("Sign-in could not be verified — please start again from the desk.", { status: 401 });
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
  res.cookies.set("sso_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/sso", maxAge: 0 }); // consume
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
