import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

// Cross-domain SSO bridge, step 0 (served on the desk's travelgenix.io domain).
// Mints a random `state`, drops it in a short-lived cookie that binds the whole
// round-trip to THIS browser (anti replay + login-CSRF), then sends the user to
// the bridge host to validate their tg_session.
export async function GET(request: NextRequest) {
  if (!env.ssoBridgeUrl) return new NextResponse("SSO is not configured.", { status: 503 });
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  const state = randomUUID();
  const url = `${env.ssoBridgeUrl}/api/sso/start?return=${encodeURIComponent(returnTo)}&state=${encodeURIComponent(state)}`;
  const res = NextResponse.redirect(url);
  res.cookies.set("sso_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/sso",
    maxAge: 300, // 5 minutes to finish the handshake
  });
  return res;
}
