import { describe, expect, it } from "vitest";
import { canAutoSend } from "./autosend";
import type { AgentOutcome } from "./types";

const answered = (confidence: number): AgentOutcome => ({ kind: "answered", reply: "Here's how…", confidence, language: null });
const clarified = (confidence: number): AgentOutcome => ({ kind: "clarified", reply: "Send the URL?", confidence, language: null });
const escalated: AgentOutcome = {
  kind: "escalated",
  category: "human_requested",
  reason: "x",
  diagnosis: "",
  stepsTried: [],
  suggestedReply: "",
  holdingReply: null,
};

// Live-trial defaults: shadow off, 0.70 bar, how_to on the allowlist, grounded.
const cfg = {
  shadowMode: false,
  confidenceBar: 0.7,
  allowedIntents: ["how_to", "deeplinks"],
  intent: "how_to",
  grounded: true,
  commits: false,
};

describe("canAutoSend", () => {
  it("sends a confident, grounded, allow-listed answer", () => {
    expect(canAutoSend(answered(0.9), cfg)).toBe(true);
  });

  it("HOLDS a confident, allow-listed answer with no KB grounding (the grounding gate)", () => {
    expect(canAutoSend(answered(0.9), { ...cfg, grounded: false })).toBe(false);
  });

  it("holds an answer below the confidence bar", () => {
    expect(canAutoSend(answered(0.65), cfg)).toBe(false);
  });

  it("holds a grounded, confident answer whose intent isn't on the allowlist", () => {
    expect(canAutoSend(answered(0.9), { ...cfg, intent: "billing_commercial" })).toBe(false);
  });

  it("holds a grounded, confident answer with no intent", () => {
    expect(canAutoSend(answered(0.9), { ...cfg, intent: null })).toBe(false);
  });

  it("auto-sends a confident clarification regardless of grounding or intent", () => {
    expect(canAutoSend(clarified(0.9), { ...cfg, grounded: false, intent: "booking_issue" })).toBe(true);
  });

  it("holds a clarification below the confidence bar", () => {
    expect(canAutoSend(clarified(0.6), cfg)).toBe(false);
  });

  it("holds everything in shadow mode — even a perfect answer", () => {
    expect(canAutoSend(answered(1), { ...cfg, shadowMode: true })).toBe(false);
    expect(canAutoSend(clarified(1), { ...cfg, shadowMode: true })).toBe(false);
  });

  it("never auto-sends an escalation", () => {
    expect(canAutoSend(escalated, cfg)).toBe(false);
  });

  it("HOLDS a reply that commits us — even a perfect, grounded answer", () => {
    // "we'll get that added", "back to you shortly" etc. A human decides what we
    // promise, so this outranks confidence, grounding and intent.
    expect(canAutoSend(answered(1), { ...cfg, commits: true })).toBe(false);
    // Clarifications normally bypass the grounding/intent bars — not this one.
    expect(canAutoSend(clarified(1), { ...cfg, commits: true })).toBe(false);
  });
});
