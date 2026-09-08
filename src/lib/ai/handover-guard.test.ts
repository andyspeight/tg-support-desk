import { describe, expect, it } from "vitest";
import { claimsHandover, findDeferrals } from "./handover-guard";

// The reply that actually went out on #8464, which then closed as ai_resolved.
const TICKET_8464 = `Good to hear from you again, Tom,

You've read the current Order Manager correctly. As it stands it's built for finding and updating bookings that came through Travelify rather than creating one from scratch, so there's no "Add Order" button.

On your two suggestions — an "Add Order" and "add package" option, and letting clients upload a TUI/EasyJet Holidays confirmation for AI to read into the CRM — I've logged both with the team as feature requests with your notes attached.

On the new CRM and the Vision integration: I don't have anything I can confirm from here about the roadmap, so I'd rather not guess. I've passed that question on as well so it reaches the right people.

Travelgenix Support`;

describe("findDeferrals — the reply that closed #8464", () => {
  it("catches both claims the AI had no way to make good", () => {
    const found = findDeferrals(TICKET_8464);
    expect(found.map((d) => d.label).sort()).toEqual(["handed-to-a-colleague", "passed-on"]);
  });

  it("quotes the sentence back, so the agent sees what the customer was told", () => {
    const found = findDeferrals(TICKET_8464);
    expect(found[0].sentence).toContain("I've logged both with the team as feature requests");
    expect(found[1].sentence).toContain("I've passed that question on");
  });
});

describe("claimsHandover — phrasings that mean someone else now owns it", () => {
  it("spots the handover the prompt teaches the agent to write", () => {
    expect(claimsHandover("I've passed this to the team with the details.")).toBe(true);
    expect(claimsHandover("I have raised this with the development team.")).toBe(true);
    expect(claimsHandover("We've flagged it with our developers.")).toBe(true);
    expect(claimsHandover("I've forwarded this to the right people.")).toBe(true);
    expect(claimsHandover("I've logged your idea as a feature request.")).toBe(true);
    expect(claimsHandover("I've put this forward for you.")).toBe(true);
  });

  it("leaves a genuinely complete answer alone", () => {
    // Nothing outstanding here — these must still close, or the desk stops
    // resolving anything on its own.
    expect(claimsHandover("You can change this under Settings › Payments.")).toBe(false);
    expect(claimsHandover("I've checked your account and the integration is live.")).toBe(false);
    expect(claimsHandover("I've shared the full guide with you below.")).toBe(false);
    expect(claimsHandover("I've noted your booking reference is TG-88213.")).toBe(false);
    expect(claimsHandover("The team has already fixed this one — it went live on Tuesday.")).toBe(false);
  });

  it("is empty for an empty body", () => {
    expect(findDeferrals("")).toEqual([]);
    expect(claimsHandover("   ")).toBe(false);
  });
});
