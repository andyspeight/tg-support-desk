import { describe, expect, it } from "vitest";
import { findCommitments, hasCommitment } from "./commitment-guard";

describe("commitment-guard", () => {
  it("catches the reported examples", () => {
    // Andy's three examples, verbatim in spirit.
    expect(hasCommitment("A member of the team will fix it and get back to you")).toBe(true);
    expect(hasCommitment("We will get that added for you")).toBe(true);
    expect(hasCommitment("We will be back to you shortly")).toBe(true);
  });

  it("catches promised timeframes", () => {
    expect(findCommitments("Someone will look at this as soon as possible.")).toContain("timeframe");
    expect(findCommitments("I'll have an answer for you within 24 hours.")).toContain("timeframe");
    expect(findCommitments("This will be looked at by the end of the day.")).toContain("timeframe");
    expect(findCommitments("We're on it and will come back right away.")).toContain("timeframe");
    expect(findCommitments("The team will respond first thing.")).toContain("timeframe");
  });

  it("catches promised outcomes", () => {
    expect(findCommitments("We'll fix this for you.")).toContain("promised-outcome");
    expect(findCommitments("That will be added to your site.")).toContain("promised-outcome");
    expect(findCommitments("I'll get that sorted.")).toContain("promised-outcome");
    expect(findCommitments("We will enable that for you.")).toContain("promised-outcome");
  });

  it("catches committing a colleague or the team", () => {
    expect(findCommitments("The team will review this.")).toContain("commits-a-colleague");
    expect(findCommitments("My colleague will take a look.")).toContain("commits-a-colleague");
    expect(findCommitments("Someone will be in touch.")).toContain("commits-a-colleague");
  });

  it("catches guarantees", () => {
    expect(findCommitments("I guarantee this will work.")).toContain("guarantee");
    expect(findCommitments("Rest assured, it's in hand.")).toContain("guarantee");
  });

  it("allows acknowledgement that states only what is true", () => {
    // The phrasing we WANT — no promise of outcome, timing or a colleague's action.
    expect(hasCommitment("Thanks for getting in touch. I've passed this to the team with the details.")).toBe(false);
    expect(hasCommitment("This one needs a colleague rather than me, so I've handed it over with everything you've sent.")).toBe(false);
    expect(hasCommitment("I've logged this and added your screenshots to the ticket.")).toBe(false);
  });

  it("allows ordinary factual and instructional answers", () => {
    expect(hasCommitment("The car hire search box has never returned hotels — it's flights and cars only.")).toBe(false);
    expect(hasCommitment("Go to Settings → Widgets and tick 'Show extras'. Full guide: https://example.com/guide")).toBe(false);
    expect(hasCommitment("Could you send the page URL including the searchSession value?")).toBe(false);
    // "today" in a factual sentence must not trip the timeframe rule.
    expect(hasCommitment("You mentioned a customer tried to search today and saw no availability.")).toBe(false);
  });

  it("passes our own fixed templates (they used to commit us)", () => {
    // The auto-acknowledgement — sent automatically, including overnight and at
    // weekends, so it must not promise a response time.
    expect(
      hasCommitment(
        "Thanks for getting in touch — we've received your message and opened ticket #8144. " +
          "It's with the support team now, and you'll see any updates on this email thread. " +
          "If you'd like to add anything — a screenshot, the page URL, anything else that helps — just reply to this email.",
      ),
    ).toBe(false);
    // The escalation holding reply.
    expect(
      hasCommitment(
        "Thanks for getting in touch. This one needs a colleague rather than me, so I've passed it straight " +
          "to the team with all the details, and it's on the support queue now.",
      ),
    ).toBe(false);
    // The wording they replaced must still be caught.
    expect(hasCommitment("A member of the team will get back to you by email as soon as we can.")).toBe(true);
    expect(hasCommitment("They'll come back to you as soon as possible.")).toBe(true);
  });

  it("is safe on empty input", () => {
    expect(findCommitments("")).toEqual([]);
    expect(hasCommitment("   ")).toBe(false);
  });
});
