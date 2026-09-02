import { describe, expect, it } from "vitest";
import { companyVisibleTo } from "./portal-visibility";

const acme = { id: "recACME", name: "Acme Travel" };
const granted = { client_id: "recACME", can_see_all_tickets: true };
const notGranted = { client_id: "recACME", can_see_all_tickets: false };

describe("companyVisibleTo — company switch off (the default)", () => {
  it("lets anyone at the company see its tickets, as before", () => {
    expect(companyVisibleTo({ company: acme, restricted: false, member: null })).toEqual(acme);
    expect(companyVisibleTo({ company: acme, restricted: false, member: notGranted })).toEqual(acme);
  });

  it("still gives nothing to someone with no company at all", () => {
    expect(companyVisibleTo({ company: null, restricted: false, member: granted })).toBeNull();
  });
});

describe("companyVisibleTo — company switch on", () => {
  it("restricts to own tickets without an explicit grant", () => {
    expect(companyVisibleTo({ company: acme, restricted: true, member: null })).toBeNull();
    expect(companyVisibleTo({ company: acme, restricted: true, member: notGranted })).toBeNull();
  });

  it("opens the company view for a granted person", () => {
    expect(companyVisibleTo({ company: acme, restricted: true, member: granted })).toEqual(acme);
  });

  it("never lets a grant for one company unlock another", () => {
    expect(
      companyVisibleTo({ company: { id: "recOTHER", name: "Other Ltd" }, restricted: true, member: granted }),
    ).toBeNull();
  });

  it("ignores a grant on a 'no company' link", () => {
    // The ex-employee row: explicitly no company, so nothing to widen to.
    expect(
      companyVisibleTo({ company: acme, restricted: true, member: { client_id: null, can_see_all_tickets: true } }),
    ).toBeNull();
  });
});
