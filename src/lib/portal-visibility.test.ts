import { describe, expect, it } from "vitest";
import { companyVisibleTo } from "./portal-visibility";

// Which of a company's tickets a client may READ in the portal. Default deny:
// belonging to a company (often inferred from an email domain) is not consent
// to read everything that company has ever raised.
describe("companyVisibleTo", () => {
  it("returns the company only when the grant is set", () => {
    expect(companyVisibleTo({ client_id: "recABC", client_name: "Ski Solutions", can_see_all_tickets: true })).toEqual({
      id: "recABC",
      name: "Ski Solutions",
    });
  });

  it("defaults to own-tickets-only for a linked member without the grant", () => {
    expect(companyVisibleTo({ client_id: "recABC", can_see_all_tickets: false })).toBeNull();
  });

  it("gives nothing to someone with no explicit link (domain/Airtable matches don't count)", () => {
    expect(companyVisibleTo(null)).toBeNull();
  });

  it("gives nothing when the grant is set but no company is linked", () => {
    // A "no company" row (the ex-employee case) must never widen access.
    expect(companyVisibleTo({ client_id: null, can_see_all_tickets: true })).toBeNull();
  });
});
