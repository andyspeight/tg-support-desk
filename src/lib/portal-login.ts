import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { signToken, verifyToken } from "@/lib/auth-tokens";
import { sendEmail } from "@/lib/channels/gmail";
import { renderCustomerEmail, textToEmailHtml } from "@/lib/channels/email-template";
import { audit, listRequesterTickets, recentActionCount } from "@/lib/db/queries";
import { matchClientByEmail, contactNameFromRecord } from "@/lib/integrations/airtable-clients";
import { firstNameFrom, isEmailish, nameFromEmail } from "@/lib/names";

// Email-link sign-in for the client help centre. Identity here is simply "you
// control this inbox" — the same standard the email channel itself trusts (a
// requester's replies come from their inbox), and it needs no Travelify master
// account, which many help-centre contacts don't have. Flow: enter your email →
// we send a 15-minute single-use link → clicking it mints the same desk_session
// cookie the SSO bridge mints.

export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
export const LOGIN_REQUEST_ACTION = "portal.login_link_requested";
export const LOGIN_USED_ACTION = "portal.login_link_used";

/** Verify a magic-link token WITHOUT consuming it — lets the confirm page show
 *  who is about to sign in. Returns null if invalid/expired/wrong-audience.
 *  Kept out of the page component so the Date.now() stays out of render. */
export function peekLoginToken(token: string): { email: string } | null {
  if (!env.authSessionSecret) return null;
  const claims = verifyToken(token, env.authSessionSecret, Date.now(), "portal-login");
  return claims?.jti ? { email: claims.email } : null;
}

/** Send a sign-in link, silently rate-limited (3/15min per email, 10/h per IP —
 *  the caller shows the same "check your inbox" either way, so the endpoint
 *  can't be used to probe or to spam someone's inbox). */
export async function requestLoginLink(email: string, ip: string, returnTo: string): Promise<void> {
  if (!env.portalLoginConfigured) return;
  const addr = email.trim().toLowerCase();

  if ((await recentActionCount(addr, LOGIN_REQUEST_ACTION, 15 * 60)) >= 3) return;
  if ((await recentActionCount(`ip:${ip}`, LOGIN_REQUEST_ACTION, 60 * 60)) >= 10) return;
  await audit("human", addr, LOGIN_REQUEST_ACTION);
  await audit("human", `ip:${ip}`, LOGIN_REQUEST_ACTION);

  // The name that goes into the session (and greeting): their name from ticket
  // history, else the Airtable contact record (only when this exact email is a
  // listed contact), else a clean recovery from the email itself — never a raw
  // email posing as a name ("Hi Darrenswan").
  let name =
    (await listRequesterTickets(addr).catch(() => []))
      .map((t) => t.requester_name)
      .find((n): n is string => Boolean(n && !isEmailish(n))) ?? null;
  if (!name) {
    const record = await matchClientByEmail(addr);
    if (record) name = contactNameFromRecord(record, addr);
  }
  name = name ?? nameFromEmail(addr) ?? addr;

  const token = signToken(
    { email: addr, name, exp: Date.now() + LOGIN_LINK_TTL_MS, aud: "portal-login", jti: randomUUID() },
    env.authSessionSecret,
  );
  const base = env.appBaseUrl.replace(/\/$/, "");
  // Lands on the confirm page (a bare GET never establishes a session); the
  // explicit "Sign in" POST there consumes the token and mints the cookie.
  const link = `${base}/signin/verify?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;

  const greeting = isEmailish(name) ? "Hi," : `Hi ${firstNameFrom(name)},`;
  const text = `${greeting}

Here's your sign-in link for Travelgenix Support:

${link}

It works for 15 minutes and can be used once — click it and you'll be signed in, back where you left off. If you didn't ask for this, you can safely ignore this email; nothing happens without the link.

— Travelgenix Support`;

  await sendEmail({
    to: addr,
    subject: "Your sign-in link — Travelgenix Support",
    text,
    html: renderCustomerEmail({ bodyHtml: textToEmailHtml(text), helpUrl: env.appBaseUrl || undefined }),
  });
}
