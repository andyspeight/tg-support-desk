import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless signed tokens (HMAC-SHA256) for the cross-domain SSO bridge:
//  - a short-lived handoff token (travelify.io bridge → travelgenix.io desk), and
//  - the desk's own session cookie.
// Format: base64url(payloadJSON) + "." + base64url(hmac). Audience-tagged so a
// handoff token can never be replayed as a session (or vice-versa); the handoff
// also carries a `state` nonce that binds it to the browser that started the flow
// (anti replay / login-CSRF). Dependency-light (only node:crypto) so it's testable.

export type TokenAud = "handoff" | "session";
export type AuthClaims = { email: string; name: string; exp: number; aud: TokenAud; state?: string };

const MAX_TOKEN_BYTES = 4096;

export function signToken(claims: AuthClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Verify signature, audience and expiry. Returns the claims, or null. */
export function verifyToken(token: string, secret: string, nowMs: number, expectedAud: TokenAud): AuthClaims | null {
  if (!token || !secret || token.length > MAX_TOKEN_BYTES) return null;
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
  if (claims.aud !== expectedAud) return null;
  if (nowMs >= claims.exp) return null;
  return claims;
}

/** Open-redirect guard (whitelist). Only a same-site absolute path survives: one
 *  leading "/", not protocol-relative, no backslash, no control chars, no encoded
 *  slash/backslash, and no scheme (":") in the first path segment. Anything else
 *  collapses to a safe default. Belt-and-braces — callers also prefix the trusted
 *  origin — but kept strict so it can't become a footgun. */
export function safeReturnPath(raw: string | null | undefined): string {
  const s = raw ?? "";
  if (!s || s.length > 512) return "/inbox";
  if (!s.startsWith("/") || s.startsWith("//")) return "/inbox"; // absolute, not protocol-relative
  if (s.includes("\\")) return "/inbox"; // no backslash (some browsers treat it as "/")
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return "/inbox"; // no control chars (tab/CR/LF/DEL)
  }
  if (/%2f%2f|%5c/i.test(s)) return "/inbox"; // no encoded "//" or "\"
  const rest = s.slice(1);
  let end = rest.length;
  for (const ch of ["/", "?", "#"]) {
    const i = rest.indexOf(ch);
    if (i !== -1 && i < end) end = i;
  }
  if (rest.slice(0, end).includes(":")) return "/inbox"; // no scheme in the first segment (javascript:)
  return s;
}
