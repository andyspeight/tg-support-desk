import { createHmac, timingSafeEqual } from "node:crypto";

// CSAT survey tokens — a tamper-proof link emailed to the requester on
// resolve. The token authorises a rating for one ticket without any login;
// the score is chosen on the survey page, so it isn't baked into the token.
// Pure (Node crypto only) so it stays unit-testable.

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signCsatToken(ticketId: string, secret: string): string {
  return `${Buffer.from(ticketId).toString("base64url")}.${hmac(ticketId, secret)}`;
}

export function verifyCsatToken(token: string, secret: string): string | null {
  const [idPart, sig] = token.split(".");
  if (!idPart || !sig) return null;
  let ticketId: string;
  try {
    ticketId = Buffer.from(idPart, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const expected = hmac(ticketId, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return ticketId;
}

export function isValidScore(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function csatSurveyUrl(baseUrl: string, ticketId: string, secret: string): string {
  const u = new URL("/csat", baseUrl);
  u.searchParams.set("t", signCsatToken(ticketId, secret));
  return u.toString();
}
