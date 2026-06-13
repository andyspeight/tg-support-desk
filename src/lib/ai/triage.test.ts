import { describe, expect, it } from "vitest";
import { parseTriageResult } from "./triage";

describe("parseTriageResult", () => {
  it("passes through valid classifications", () => {
    expect(parseTriageResult({ intent: "widget", priority: "p1", language: "en" })).toEqual({
      intent: "widget",
      priority: "p1",
      language: "en",
    });
  });

  it("falls back to safe defaults on unknown values", () => {
    expect(parseTriageResult({ intent: "nonsense", priority: "urgent", language: "English" })).toEqual({
      intent: "other",
      priority: "p3",
      language: "en",
    });
  });

  it("normalises case and missing fields", () => {
    expect(parseTriageResult({ priority: "P2", language: "DE" })).toEqual({
      intent: "other",
      priority: "p2",
      language: "de",
    });
  });
});
