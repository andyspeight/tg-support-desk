import { describe, expect, it } from "vitest";
import { sanitizeSearchTerm } from "./search-term";

describe("sanitizeSearchTerm", () => {
  it("passes ordinary text through unchanged", () => {
    expect(sanitizeSearchTerm("widget embed")).toBe("widget embed");
    expect(sanitizeSearchTerm("sarah@example.com")).toBe("sarah@example.com");
  });

  // Regression: a term must not be able to inject extra PostgREST or() conditions.
  it("strips filter metacharacters that could restructure an or() filter", () => {
    expect(sanitizeSearchTerm("a,status.eq.closed")).toBe("a status.eq.closed");
    expect(sanitizeSearchTerm("x()y")).toBe("x y");
    expect(sanitizeSearchTerm('q"%_\\z')).toBe("q z");
  });

  it("returns empty when the term is only metacharacters (caller then matches nothing)", () => {
    expect(sanitizeSearchTerm(")(),%_")).toBe("");
  });

  it("collapses internal whitespace and trims", () => {
    expect(sanitizeSearchTerm("  a   b  ")).toBe("a b");
  });
});
