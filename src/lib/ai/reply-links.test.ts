import { describe, expect, it } from "vitest";
import { sanitiseReplyLinks } from "./reply-links";

const RETRIEVED = ["https://university.travelgenix.io/getting-found-online"];

describe("sanitiseReplyLinks", () => {
  it("keeps a retrieved University link", () => {
    const body = "Here's the short version.\n\nWant the full walkthrough? https://university.travelgenix.io/getting-found-online";
    expect(sanitiseReplyLinks(body, RETRIEVED)).toContain("getting-found-online");
  });

  it("tolerates trailing punctuation and a trailing slash", () => {
    const body = "Answer.\n\nMore detail here: https://university.travelgenix.io/getting-found-online/.";
    expect(sanitiseReplyLinks(body, RETRIEVED)).toContain("getting-found-online");
  });

  it("drops a line with a hallucinated University link", () => {
    const body = "The setting is under Widgets.\n\nWant more? https://university.travelgenix.io/made-up-page";
    const out = sanitiseReplyLinks(body, RETRIEVED);
    expect(out).not.toContain("made-up-page");
    expect(out).toContain("The setting is under Widgets.");
  });

  it("leaves non-University URLs untouched", () => {
    const body = "Paste this snippet: https://widgets.travelify.io/embed.js before </body>.";
    expect(sanitiseReplyLinks(body, [])).toContain("https://widgets.travelify.io/embed.js");
  });

  it("returns plain answers unchanged", () => {
    const body = "Hi Sarah,\n\nYour site ID is in Dashboard → Settings.\n\nTravelgenix Support";
    expect(sanitiseReplyLinks(body, RETRIEVED)).toBe(body);
  });
});
