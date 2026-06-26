import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { validateTgSession } from "@/lib/auth";
import { signToken, safeReturnPath } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

const HANDOFF_TTL_MS = 60_000; // 60s — exchanged for the desk session immediately

// Cross-domain SSO bridge, step 1. Served on the *.travelify.io host (so the
// browser sends the tg_session cookie). Validates the central session, then
// redirects to the desk's callback on the travelgenix.io domain with a short-
// lived signed token. The desk owner never has to change id.travelify.io.
export async function GET(request: NextRequest) {
  if (!env.authSessionSecret || !env.appBaseUrl) {
    return new NextResponse("SSO is not configured.", { status: 503 });
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  const tg = request.cookies.get("tg_session")?.value;

  if (!tg) {
    // Not signed into Travelgenix at all → bounce to the SSO login, returning here.
    if (env.ssoLoginUrl && env.ssoBridgeUrl) {
      const back = `${env.ssoBridgeUrl}/api/sso/start?return=${encodeURIComponent(returnTo)}`;
      return NextResponse.redirect(`${env.ssoLoginUrl}?redirect=${encodeURIComponent(back)}`);
    }
    return new NextResponse("Please sign in to Travelgenix first, then reopen the desk.", { status: 401 });
  }

  const user = await validateTgSession(tg);
  if (!user) {
    return new NextResponse("Your Travelgenix session has expired — please sign in again.", { status: 401 });
  }

  const token = signToken(
    { email: user.email, name: user.name, exp: Date.now() + HANDOFF_TTL_MS },
    env.authSessionSecret,
  );
  const callback = `${env.appBaseUrl}/api/sso/callback?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;
  const res = NextResponse.redirect(callback);
  res.headers.set("Referrer-Policy", "no-referrer"); // don't leak the token to the next hop
  return res;
}
