import { describe, expect, it } from "vitest";
import { csatSurveyUrl, isValidScore, signCsatToken, verifyCsatToken } from "./csat";

const SECRET = "test-secret-key";

describe("CSAT tokens", () => {
  it("round-trips a ticket id", () => {
    const token = signCsatToken("ticket-abc-123", SECRET);
    expect(verifyCsatToken(token, SECRET)).toBe("ticket-abc-123");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signCsatToken("ticket-abc-123", SECRET);
    expect(verifyCsatToken(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered ticket id", () => {
    const token = signCsatToken("ticket-abc-123", SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("ticket-evil").toString("base64url")}.${sig}`;
    expect(verifyCsatToken(forged, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyCsatToken("garbage", SECRET)).toBeNull();
    expect(verifyCsatToken("", SECRET)).toBeNull();
  });

  it("builds a survey URL carrying the token", () => {
    const url = csatSurveyUrl("https://desk.travelify.io", "t-1", SECRET);
    expect(url.startsWith("https://desk.travelify.io/csat?t=")).toBe(true);
  });
});

describe("isValidScore", () => {
  it("accepts 1–5 integers only", () => {
    expect([1, 2, 3, 4, 5].every(isValidScore)).toBe(true);
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(6)).toBe(false);
    expect(isValidScore(3.5)).toBe(false);
    expect(isValidScore("4")).toBe(false);
  });
});
