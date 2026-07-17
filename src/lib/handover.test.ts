import { describe, it, expect } from "vitest";
import { handoverDiagnosis, truncate } from "./handover";

describe("handoverDiagnosis", () => {
  it("pulls the first line of the Diagnosis section", () => {
    const body =
      "AI HANDOVER\nCategory: commercial_or_billing\nReason: guardrail match: \"refund\"\n\n" +
      "Diagnosis:\nThe message touches a topic the AI must not handle. Policy escalation.\n\n" +
      "Steps tried:\n- inbound guardrail pre-check\n\nSuggested reply:\n(none drafted)";
    expect(handoverDiagnosis(body)).toBe("The message touches a topic the AI must not handle. Policy escalation.");
  });

  it("handles the diagnosis on the same line as the label", () => {
    expect(handoverDiagnosis("Diagnosis: Extras page skipped on ticket-only flows.")).toBe(
      "Extras page skipped on ticket-only flows.",
    );
  });

  it("falls back to the first meaningful line when there is no Diagnosis section", () => {
    expect(handoverDiagnosis("AI HANDOVER\nCategory: other\n\nSomething went wrong here.")).toBe(
      "Something went wrong here.",
    );
  });

  it("returns a neutral default for an empty or shapeless note", () => {
    expect(handoverDiagnosis("AI HANDOVER\nCategory: other\nReason: other")).toMatch(/escalated to a human/i);
    expect(handoverDiagnosis("")).toMatch(/escalated to a human/i);
  });
});

describe("truncate", () => {
  it("leaves short text untouched", () => {
    expect(truncate("short", 160)).toBe("short");
  });

  it("cuts on a word boundary with an ellipsis", () => {
    const out = truncate("the quick brown fox jumps over the lazy dog", 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out).not.toMatch(/\s…$/); // no dangling space before the ellipsis
  });
});
