import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { validateTgSession } from "@/lib/auth";
import { signToken, safeReturnPath } from "@/lib/auth-tokens";
import { buildSigninUrl, loginInterstitialHtml } from "@/lib/sso-login-page";

export const dynamic = "force-dynamic";

const HANDOFF_TTL_MS = 120_000; // 120s — exchanged for the desk session immediately; a touch of slack for a slow id.travelify.io hop

// Cross-domain SSO bridge, step 1. Served on the *.travelify.io host (so the
// browser sends the tg_session cookie). Validates the central session, then
// redirects to the desk's callback with a short-lived signed handoff token that
// carries the caller's `state` nonce (set by /api/sso/login, bound to the browser).
export async function GET(request: NextRequest) {
  if (!env.authSessionSecret || !env.appBaseUrl) {
    return new NextResponse("SSO is not configured.", { status: 503 });
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  // Our own login route mints state as a UUID; anything else is noise — drop it
  // before it's echoed into a URL/page.
  const rawState = request.nextUrl.searchParams.get("state") ?? "";
  const state = /^[A-Za-z0-9-]{0,64}$/.test(rawState) ? rawState : "";
  const tg = request.cookies.get("tg_session")?.value;
  const user = tg ? await validateTgSession(tg) : null;

  if (!user) {
    // No usable Travelgenix session (none, expired, or id briefly unreachable).
    // Don't blind-redirect to signin.html — it doesn't reliably send the user
    // back, which strands them on the Travelify side after logging in. Instead
    // serve a small page that opens the sign-in in a popup and polls
    // /api/sso/check; the moment the session exists it reloads this same URL,
    // which then completes the handshake below and returns the user to the desk.
    if (env.ssoLoginUrl && env.ssoBridgeUrl) {
      const back = `${env.ssoBridgeUrl}/api/sso/start?return=${encodeURIComponent(returnTo)}&state=${encodeURIComponent(state)}`;
      return new NextResponse(
        loginInterstitialHtml({ signinUrl: buildSigninUrl(env.ssoLoginUrl, back), checkPath: "/api/sso/check" }),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer", // the URL carries the state nonce
          },
        },
      );
    }
    return new NextResponse("Please sign in to Travelgenix first, then reopen the desk.", { status: 401 });
  }

  const token = signToken(
    { email: user.email, name: user.name, exp: Date.now() + HANDOFF_TTL_MS, aud: "handoff", state },
    env.authSessionSecret,
  );
  const callback = `${env.appBaseUrl}/api/sso/callback?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;
  const res = NextResponse.redirect(callback);
  res.headers.set("Referrer-Policy", "no-referrer"); // don't leak the token to the next hop
  return res;
}
