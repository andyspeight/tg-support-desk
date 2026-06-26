import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { verifyToken } from "@/lib/auth-tokens";

export type Session = {
  email: string;
  name: string;
  isAgent: boolean;
};

/**
 * Travelgenix SSO: validates the `tg_session` cookie against the existing
 * auth-session endpoint (Luna Chat pattern) — no password system here.
 * Agent seats come from the AGENT_EMAILS env allowlist for Phase 1.
 *
 * Validation endpoint (set TG_AUTH_SESSION_URL): id.travelify.io/api/auth/me —
 * the Luna Chat pattern. It returns { ok, user: { email, name? }, client } when
 * the request carries a valid tg_session cookie. This only works on a
 * *.travelify.io host, where the browser sends that cookie; a non-travelify.io
 * domain needs the cross-domain token bridge instead.
 */
/** Validate a raw tg_session value against id.travelify.io/api/auth/me. Used both
 *  directly (on a *.travelify.io host) and by the SSO bridge route. Fails closed. */
export async function validateTgSession(tgSession: string): Promise<{ email: string; name: string } | null> {
  if (!tgSession || !env.tgAuthSessionUrl) return null;
  try {
    const res = await fetch(env.tgAuthSessionUrl, {
      headers: { cookie: `tg_session=${tgSession}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000), // SSO check gates every request — fail fast, never hang
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; user?: { email?: string; name?: string } }
      | null;
    if (!data?.ok || !data.user?.email) return null; // id returns { ok:false } when invalid
    const email = data.user.email.toLowerCase();
    return { email, name: data.user.name ?? email };
  } catch {
    return null; // fail closed
  }
}

export async function getSession(): Promise<Session | null> {
  if (env.authDevBypass) {
    return { email: "dev@travelgenix.local", name: "Dev Agent", isAgent: true };
  }

  const store = await cookies();

  // 1) Desk session minted by the cross-domain SSO bridge — self-contained and
  //    signed, verified locally with no network round-trip.
  const desk = store.get("desk_session")?.value;
  if (desk && env.authSessionSecret) {
    const claims = verifyToken(desk, env.authSessionSecret, Date.now(), "session");
    if (claims) {
      return { email: claims.email, name: claims.name, isAgent: env.agentEmails.includes(claims.email) };
    }
  }

  // 2) Direct tg_session validation — when the desk is served on a *.travelify.io
  //    host, the browser sends the cookie and we validate it against id.
  const tg = store.get("tg_session")?.value;
  if (tg) {
    const user = await validateTgSession(tg);
    if (user) {
      return { email: user.email, name: user.name, isAgent: env.agentEmails.includes(user.email) };
    }
  }

  return null;
}

export async function requireAgent(): Promise<Session> {
  const session = await getSession();
  if (!session?.isAgent) throw new Error("Not authorised: agent session required");
  return session;
}

/** Any authenticated Travelgenix user — used by the client support portal.
 *  Portal data is always scoped to session.email, so a client only ever sees
 *  their own tickets. */
export async function requireClient(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authorised: sign in required");
  return session;
}
