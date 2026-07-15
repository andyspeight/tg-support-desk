import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { signToken, verifyToken, safeReturnPath } from "@/lib/auth-tokens";
import { LOGIN_LINK_TTL_MS, LOGIN_USED_ACTION } from "@/lib/portal-login";
import { audit, recentActionCount } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // same 30d session the SSO bridge mints

// The emailed sign-in link lands here: verify the 15-minute portal-login token,
// enforce single use (its jti is recorded in the audit log on first use), then
// mint the desk's session cookie and drop the client back where they left off.
export async function GET(request: NextRequest) {
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"), "/");
  if (!env.authSessionSecret || !env.appBaseUrl) {
    return new NextResponse("Sign-in is not configured.", { status: 503 });
  }
  const fail = NextResponse.redirect(
    `${env.appBaseUrl}/signin?error=1&return=${encodeURIComponent(returnTo)}`,
  );

  const claims = verifyToken(request.nextUrl.searchParams.get("token") ?? "", env.authSessionSecret, Date.now(), "portal-login");
  if (!claims?.jti) return fail;

  // Single use: the jti is written to the audit log the first time it's seen;
  // any later click of the same link (forwarded email, refresh) is refused. The
  // check window comfortably covers the token's own 15-minute life.
  const windowSeconds = Math.ceil(LOGIN_LINK_TTL_MS / 1000) + 120;
  if ((await recentActionCount(`jti:${claims.jti}`, LOGIN_USED_ACTION, windowSeconds)) > 0) return fail;
  await audit("human", `jti:${claims.jti}`, LOGIN_USED_ACTION, undefined, { email: claims.email });

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
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
