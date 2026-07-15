import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { signToken } from "@/lib/auth-tokens";
import { sendEmail } from "@/lib/channels/gmail";
import { renderCustomerEmail, textToEmailHtml } from "@/lib/channels/email-template";
import { audit, listRequesterTickets, recentActionCount } from "@/lib/db/queries";
import { firstNameFrom } from "@/lib/names";

// Email-link sign-in for the client help centre. Identity here is simply "you
// control this inbox" — the same standard the email channel itself trusts (a
// requester's replies come from their inbox), and it needs no Travelify master
// account, which many help-centre contacts don't have. Flow: enter your email →
// we send a 15-minute single-use link → clicking it mints the same desk_session
// cookie the SSO bridge mints.

export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
export const LOGIN_REQUEST_ACTION = "portal.login_link_requested";
export const LOGIN_USED_ACTION = "portal.login_link_used";

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

  // Greet by the name we know them by (their latest ticket), else the email.
  const name = (await listRequesterTickets(addr).catch(() => []))
    .map((t) => t.requester_name)
    .find((n): n is string => Boolean(n && n.toLowerCase() !== addr)) ?? addr;

  const token = signToken(
    { email: addr, name, exp: Date.now() + LOGIN_LINK_TTL_MS, aud: "portal-login", jti: randomUUID() },
    env.authSessionSecret,
  );
  const base = env.appBaseUrl.replace(/\/$/, "");
  const link = `${base}/api/portal-auth/verify?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;

  const first = firstNameFrom(name);
  const greeting = first && first.toLowerCase() !== addr ? `Hi ${first},` : "Hi,";
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
