import { describe, expect, it } from "vitest";
import { signToken, verifyToken, safeReturnPath } from "./auth-tokens";

const SECRET = "test-secret-please-change";
const now = 1_000_000_000_000;
const claims = { email: "a@b.com", name: "A B", exp: now + 60_000, aud: "session" as const };

describe("signToken / verifyToken", () => {
  it("round-trips valid claims with the right audience", () => {
    const token = signToken(claims, SECRET);
    expect(verifyToken(token, SECRET, now, "session")).toEqual(claims);
  });

  it("rejects an audience mismatch (handoff ≠ session)", () => {
    const handoff = signToken({ ...claims, aud: "handoff" }, SECRET);
    expect(verifyToken(handoff, SECRET, now, "session")).toBeNull();
    expect(verifyToken(handoff, SECRET, now, "handoff")).not.toBeNull();
  });

  it("a portal-login link token can never be replayed as a session (or vice-versa)", () => {
    const link = signToken({ ...claims, aud: "portal-login", jti: "j-1" }, SECRET);
    expect(verifyToken(link, SECRET, now, "session")).toBeNull();
    expect(verifyToken(link, SECRET, now, "handoff")).toBeNull();
    expect(verifyToken(link, SECRET, now, "portal-login")?.jti).toBe("j-1");
    const session = signToken(claims, SECRET);
    expect(verifyToken(session, SECRET, now, "portal-login")).toBeNull();
  });

  it("rejects expired, wrong-secret, empty-secret and oversize tokens", () => {
    expect(verifyToken(signToken({ ...claims, exp: now }, SECRET), SECRET, now, "session")).toBeNull();
    expect(verifyToken(signToken(claims, SECRET), "other", now, "session")).toBeNull();
    expect(verifyToken(signToken(claims, SECRET), "", now, "session")).toBeNull();
    expect(verifyToken("x".repeat(5000) + ".y", SECRET, now, "session")).toBeNull();
  });

  it("rejects tampered payloads and malformed tokens", () => {
    const token = signToken(claims, SECRET);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, email: "evil@x.com" })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET, now, "session")).toBeNull();
    expect(verifyToken(`${body}.deadbeef`, SECRET, now, "session")).toBeNull();
    expect(verifyToken("nodot", SECRET, now, "session")).toBeNull();
    expect(verifyToken(".justmac", SECRET, now, "session")).toBeNull();
  });
});

describe("safeReturnPath", () => {
  it("keeps same-site paths", () => {
    expect(safeReturnPath("/staff/inbox")).toBe("/staff/inbox");
    expect(safeReturnPath("/staff/ticket/abc?x=1#h")).toBe("/staff/ticket/abc?x=1#h");
  });

  it("blocks every cross-origin escape", () => {
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/\t//evil.com",
      "/\r\n//evil.com",
      "/%2f%2fevil.com",
      "/%5cevil.com",
      "/javascript:alert(1)",
      " //evil.com",
      "",
      null,
    ]) {
      expect(safeReturnPath(bad)).toBe("/staff/inbox");
    }
  });

  it("collapses to the caller's fallback when one is given (portal flows use /)", () => {
    expect(safeReturnPath("//evil.com", "/")).toBe("/");
    expect(safeReturnPath(null, "/")).toBe("/");
    expect(safeReturnPath("/tickets/abc", "/")).toBe("/tickets/abc");
  });
});
