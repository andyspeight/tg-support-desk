import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless signed tokens (HMAC-SHA256) for the cross-domain SSO bridge:
//  - a short-lived handoff token (travelify.io bridge → travelgenix.io desk), and
//  - the desk's own session cookie.
// Format: base64url(payloadJSON) + "." + base64url(hmac). Kept dependency-light
// (only node:crypto) so it's unit-testable.

export type AuthClaims = { email: string; name: string; exp: number };

export function signToken(claims: AuthClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Verify signature + expiry. Returns the claims, or null if invalid/expired. */
export function verifyToken(token: string, secret: string, nowMs: number): AuthClaims | null {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) return null;
  let claims: AuthClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthClaims;
  } catch {
    return null;
  }
  if (!claims || typeof claims.email !== "string" || typeof claims.exp !== "number") return null;
  if (nowMs >= claims.exp) return null;
  return claims;
}

/** Open-redirect guard: only allow a same-site absolute path (a single leading
 *  "/"), never an absolute URL or protocol-relative "//host". */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/inbox";
  return raw;
}
