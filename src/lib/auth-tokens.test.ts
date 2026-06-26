import { describe, expect, it } from "vitest";
import { signToken, verifyToken, safeReturnPath } from "./auth-tokens";

const SECRET = "test-secret-please-change";
const now = 1_000_000_000_000;

describe("signToken / verifyToken", () => {
  it("round-trips valid claims", () => {
    const token = signToken({ email: "a@b.com", name: "A B", exp: now + 60_000 }, SECRET);
    expect(verifyToken(token, SECRET, now)).toEqual({ email: "a@b.com", name: "A B", exp: now + 60_000 });
  });

  it("rejects an expired token", () => {
    const token = signToken({ email: "a@b.com", name: "A", exp: now }, SECRET);
    expect(verifyToken(token, SECRET, now)).toBeNull(); // exp == now is expired
    expect(verifyToken(token, SECRET, now - 1)).not.toBeNull();
  });

  it("rejects a wrong/empty secret", () => {
    const token = signToken({ email: "a@b.com", name: "A", exp: now + 1000 }, SECRET);
    expect(verifyToken(token, "other-secret", now)).toBeNull();
    expect(verifyToken(token, "", now)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signToken({ email: "a@b.com", name: "A", exp: now + 1000 }, SECRET);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "evil@x.com", name: "E", exp: now + 1000 })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifyToken(`${body}.deadbeef`, SECRET, now)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyToken("", SECRET, now)).toBeNull();
    expect(verifyToken("nodot", SECRET, now)).toBeNull();
    expect(verifyToken(".justmac", SECRET, now)).toBeNull();
  });
});

describe("safeReturnPath", () => {
  it("keeps same-site paths", () => {
    expect(safeReturnPath("/inbox")).toBe("/inbox");
    expect(safeReturnPath("/ticket/abc?x=1")).toBe("/ticket/abc?x=1");
  });
  it("blocks open redirects", () => {
    expect(safeReturnPath("//evil.com")).toBe("/inbox");
    expect(safeReturnPath("https://evil.com")).toBe("/inbox");
    expect(safeReturnPath("/\\evil.com")).toBe("/inbox");
    expect(safeReturnPath(null)).toBe("/inbox");
    expect(safeReturnPath("")).toBe("/inbox");
  });
});
