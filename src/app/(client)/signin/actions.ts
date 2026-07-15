"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeReturnPath, signToken, verifyToken } from "@/lib/auth-tokens";
import { clientIp } from "@/lib/client-ip";
import { requestLoginLink } from "@/lib/portal-login";
import { consumeLoginToken } from "@/lib/db/queries";

const schema = z.object({
  email: z.string().trim().email().max(200),
  return: z.string().max(512).optional(),
});

/** Email a sign-in link. Always lands on the same "check your inbox" state —
 *  whether or not the send happened (rate limits fail silently inside), so the
 *  form can't be used to probe addresses. */
export async function requestLinkAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    return: formData.get("return") ?? undefined,
  });
  const returnTo = safeReturnPath(parsed.success ? parsed.data.return : "/", "/");
  if (!parsed.success) redirect(`/signin?return=${encodeURIComponent(returnTo)}`);

  try {
    await requestLoginLink(parsed.data.email, await clientIp(), returnTo);
  } catch {
    // Fail to the same confirmation — never block on (or reveal) send trouble;
    // the client can simply request another link.
  }
  redirect(`/signin?sent=1&return=${encodeURIComponent(returnTo)}`);
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the SSO-minted desk session

/** Complete an emailed sign-in link — invoked ONLY by the explicit same-origin
 *  POST on the confirm page (/signin/verify). A bare GET (link scanner, a
 *  cross-site image/anchor) can never reach here — Next server actions require a
 *  same-origin POST — so a cross-site request can't establish a session and a
 *  prefetch can't burn the token. This is the login-CSRF fix. */
export async function completeSignInAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnPath(String(formData.get("return") ?? "/"), "/");
  const bail = `/signin?error=1&return=${encodeURIComponent(returnTo)}`;
  if (!env.authSessionSecret) redirect(bail);

  const claims = verifyToken(String(formData.get("token") ?? ""), env.authSessionSecret, Date.now(), "portal-login");
  if (!claims?.jti) redirect(bail);

  // Atomic single-use (primary-key insert) — a replay or concurrent click fails here.
  const firstUse = await consumeLoginToken(claims.jti, claims.email);
  if (!firstUse) redirect(bail);

  const session = signToken(
    { email: claims.email, name: claims.name, exp: Date.now() + SESSION_TTL_MS, aud: "session" },
    env.authSessionSecret,
  );
  (await cookies()).set("desk_session", session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect(returnTo);
}
