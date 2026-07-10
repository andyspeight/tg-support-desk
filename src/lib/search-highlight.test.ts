import { describe, it, expect } from "vitest";
import { splitHighlight, sinceForRange } from "./search-highlight";

describe("splitHighlight", () => {
  it("splits a single highlight", () => {
    expect(splitHighlight("a⟦b⟧c")).toEqual([
      { text: "a", hit: false },
      { text: "b", hit: true },
      { text: "c", hit: false },
    ]);
  });

  it("handles text with no marks", () => {
    expect(splitHighlight("plain text")).toEqual([{ text: "plain text", hit: false }]);
  });

  it("handles adjacent and leading/trailing highlights", () => {
    expect(splitHighlight("⟦x⟧⟦y⟧")).toEqual([
      { text: "x", hit: true },
      { text: "y", hit: true },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(splitHighlight("")).toEqual([]);
  });

  it("keeps text after the last highlight", () => {
    expect(splitHighlight("set the ⟦pricing⟧ rules")).toEqual([
      { text: "set the ", hit: false },
      { text: "pricing", hit: true },
      { text: " rules", hit: false },
    ]);
  });
});

describe("sinceForRange", () => {
  const now = Date.UTC(2026, 0, 31, 12, 0, 0); // fixed instant

  it("returns null for 'any'", () => {
    expect(sinceForRange("any", now)).toBeNull();
  });

  it("subtracts the right window", () => {
    expect(sinceForRange("24h", now)).toBe(new Date(now - 86_400_000).toISOString());
    expect(sinceForRange("7d", now)).toBe(new Date(now - 7 * 86_400_000).toISOString());
    expect(sinceForRange("30d", now)).toBe(new Date(now - 30 * 86_400_000).toISOString());
  });
});
