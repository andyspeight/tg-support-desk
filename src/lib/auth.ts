import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

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
 * NOTE: the response shape `{ user: { email, name } }` is the assumed seam;
 * align it with the live /api/auth-session contract when wiring SSO up.
 */
export async function getSession(): Promise<Session | null> {
  if (env.authDevBypass) {
    return { email: "dev@travelgenix.local", name: "Dev Agent", isAgent: true };
  }

  const store = await cookies();
  const cookie = store.get("tg_session");
  if (!cookie?.value || !env.tgAuthSessionUrl) return null;

  try {
    const res = await fetch(env.tgAuthSessionUrl, {
      headers: { cookie: `tg_session=${cookie.value}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { email?: string; name?: string } };
    const email = data.user?.email?.toLowerCase();
    if (!email) return null;
    return {
      email,
      name: data.user?.name ?? email,
      isAgent: env.agentEmails.includes(email),
    };
  } catch {
    return null; // fail closed
  }
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
