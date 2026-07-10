import { describe, it, expect } from "vitest";
import { embeddableTicketText } from "./ticket-embedding-text";

describe("embeddableTicketText", () => {
  it("includes subject plus customer/ai/human messages", () => {
    const text = embeddableTicketText("Pricing help", [
      { role: "customer", body_text: "How do I set pricing?" },
      { role: "ai", body_text: "Use the Pricing Rules engine." },
      { role: "human", body_text: "Anything else?" },
    ]);
    expect(text).toBe("Pricing help\n\nHow do I set pricing?\n\nUse the Pricing Rules engine.\n\nAnything else?");
  });

  it("excludes internal notes and system messages", () => {
    const text = embeddableTicketText("Subj", [
      { role: "system", body_text: "auto-ack" },
      { role: "customer", body_text: "the question" },
      { role: "internal_note", body_text: "AI HANDOVER…" },
    ]);
    expect(text).toBe("Subj\n\nthe question");
  });

  it("drops empty bodies and caps length", () => {
    const long = "x".repeat(9000);
    const text = embeddableTicketText("S", [
      { role: "customer", body_text: "   " },
      { role: "customer", body_text: long },
    ]);
    expect(text.length).toBe(8000);
    expect(text.startsWith("S\n\n")).toBe(true);
  });
});
