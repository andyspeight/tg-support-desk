import { NextResponse, type NextRequest } from "next/server";

// Defense-in-depth for the cross-domain SSO bridge: the *.travelify.io bridge
// host (SSO_BRIDGE_URL) exists only to run /api/sso/start (where it receives the
// tg_session cookie). Lock it down so the full desk UI — and its tg_session auth
// path — is reachable only via the primary travelgenix.io domain. Any other path
// on the bridge host is bounced to the desk's public URL.
// (Next 16 "proxy" convention, formerly middleware.)
export function proxy(req: NextRequest) {
  const bridge = process.env.SSO_BRIDGE_URL;
  if (!bridge) return NextResponse.next();
  try {
    const bridgeHost = new URL(bridge).host;
    if (req.nextUrl.host === bridgeHost && req.nextUrl.pathname !== "/api/sso/start") {
      const appBase = process.env.APP_BASE_URL;
      if (appBase) {
        return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, appBase));
      }
      return new NextResponse("Not found", { status: 404 });
    }
  } catch {
    // malformed SSO_BRIDGE_URL — fall through to normal routing (per-route auth still applies)
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
