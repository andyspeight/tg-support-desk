import { describe, it, expect } from "vitest";
import { hasNegation, reversesStance } from "./rewrite-guard";

describe("hasNegation", () => {
  it("detects refusals and negations", () => {
    expect(hasNegation("No, we can't do that")).toBe(true);
    expect(hasNegation("That isn't something we can do")).toBe(true);
    expect(hasNegation("We are unable to offer that")).toBe(true);
    expect(hasNegation("Cannot be changed once booked")).toBe(true);
    expect(hasNegation("We can not do that")).toBe(true);
  });
  it("returns false for plain affirmatives", () => {
    expect(hasNegation("Yes, we can. Please send more information")).toBe(false);
    expect(hasNegation("Of course — we'd be glad to help")).toBe(false);
    expect(hasNegation("That's all set up now")).toBe(false);
  });
});

describe("reversesStance", () => {
  it("flags a refusal rewritten with no negation (the reported bug)", () => {
    // "No, we can't do that" -> "Yes, we can. Please send more information"
    expect(reversesStance("No, we can't do that", "Yes, we can. Please send more information")).toBe(true);
    expect(reversesStance("We can't offer a refund on this booking", "We'd be happy to sort a refund for you")).toBe(true);
  });

  it("allows a faithful rewrite that keeps the refusal", () => {
    expect(reversesStance("No, we can't do that", "I'm afraid that isn't something we can do")).toBe(false);
    expect(reversesStance("We can't offer a refund", "We're unable to offer a refund on this one")).toBe(false);
  });

  it("does not touch affirmative drafts (nothing to reverse)", () => {
    expect(reversesStance("Yes, we can help with that", "Of course — happy to help with that")).toBe(false);
    expect(reversesStance("Please send your booking reference", "Could you send your booking reference?")).toBe(false);
  });

  it("is safe on empty input", () => {
    expect(reversesStance("", "anything")).toBe(false);
    expect(reversesStance("No we can't", "")).toBe(false);
  });
});
