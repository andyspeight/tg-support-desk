import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeReturnPath } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

// Legacy landing for magic-link emails sent before sign-in moved to a confirm
// page. It no longer mints a session on GET (that was a login-CSRF: a bare GET
// signed in whoever opened the link). It just forwards to /signin/verify, where
// an explicit same-origin POST completes the sign-in. Kept so links already in
// inboxes still work; new links point straight at /signin/verify.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"), "/");
  const base = env.appBaseUrl || request.nextUrl.origin;
  return NextResponse.redirect(
    `${base}/signin/verify?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`,
  );
}
