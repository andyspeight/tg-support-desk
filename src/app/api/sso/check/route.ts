import { NextResponse, type NextRequest } from "next/server";
import { validateTgSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Polled (same-origin) by the /api/sso/start sign-in page: does this browser now
// hold a valid tg_session? Boolean only — no user data leaves here — and
// no-store so every poll is live. No CORS headers, so cross-origin pages can't
// read the answer.
export async function GET(request: NextRequest) {
  const tg = request.cookies.get("tg_session")?.value;
  const user = tg ? await validateTgSession(tg) : null;
  return NextResponse.json({ signedIn: Boolean(user) }, { headers: { "Cache-Control": "no-store" } });
}
