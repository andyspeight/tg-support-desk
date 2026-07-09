import { describe, expect, it } from "vitest";
import { classifyEdit, isMaterialEdit } from "./draft-diff";

describe("classifyEdit", () => {
  const draft = "Hi Sarah, your API key lives in Dashboard then Settings then Integrations. Copy it from there.";

  it("scores an unchanged send as as_sent", () => {
    const { editClass, similarity } = classifyEdit(draft, draft);
    expect(similarity).toBe(1);
    expect(editClass).toBe("as_sent");
  });

  it("treats punctuation/whitespace-only tweaks as as_sent", () => {
    const sent = "Hi Sarah — your API key lives in Dashboard, then Settings, then Integrations.  Copy it from there!";
    expect(classifyEdit(draft, sent).editClass).toBe("as_sent");
  });

  it("flags a small wording change as a light_edit", () => {
    const sent = "Hi Sarah, your API key lives in Dashboard then Settings then Integrations. You can copy it straight from that screen.";
    expect(classifyEdit(draft, sent).editClass).toBe("light_edit");
  });

  it("flags a full rewrite as a material edit", () => {
    const sent = "Hi Sarah, that credential actually rotates nightly, so grab a fresh one from the Security tab each morning before your first sync.";
    const { editClass } = classifyEdit(draft, sent);
    expect(editClass === "heavy_edit" || editClass === "discarded").toBe(true);
    expect(isMaterialEdit(editClass)).toBe(true);
  });

  it("treats an empty draft as discarded (nothing to learn from)", () => {
    expect(classifyEdit("", "anything the agent wrote").editClass).toBe("discarded");
  });

  it("only counts heavy_edit / discarded as material", () => {
    expect(isMaterialEdit("as_sent")).toBe(false);
    expect(isMaterialEdit("light_edit")).toBe(false);
    expect(isMaterialEdit("heavy_edit")).toBe(true);
    expect(isMaterialEdit("discarded")).toBe(true);
  });
});
