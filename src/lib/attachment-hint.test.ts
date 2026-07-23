import { describe, it, expect } from "vitest";
import { mentionsAttachment } from "./attachment-hint";

describe("mentionsAttachment", () => {
  it("fires on clear attachment language", () => {
    // Real phrasing from tickets where the screenshots went missing (#8071).
    expect(mentionsAttachment("I have attached screenshots for your reference.")).toBe(true);
    expect(mentionsAttachment("I have attached screenshots highlighting the issue.")).toBe(true);
    expect(mentionsAttachment("Please see the image below.")).toBe(true);
    expect(mentionsAttachment("Screenshot of the error is enclosed.")).toBe(true);
    expect(mentionsAttachment("Sending a screen shot of the widget.")).toBe(true);
    expect(mentionsAttachment("Find the photos here.")).toBe(true);
  });

  it("does not fire on incidental wording", () => {
    // The bare verb "attach" is a common false positive to avoid.
    expect(mentionsAttachment("Please attach the widget to the last-minute deals page.")).toBe(false);
    expect(mentionsAttachment("The widget doesn't fit my screen size.")).toBe(false);
    expect(mentionsAttachment("The fares don't match between the two widgets.")).toBe(false);
    expect(mentionsAttachment("")).toBe(false);
  });
});
