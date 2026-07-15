import { describe, expect, it } from "vitest";
import { pickDomainMatch, pickExactEmailMatch, recordEmails, type ClientRecordLike } from "./client-match";

const FIELDS = ["Primary Contact Email", "Emails"];

const acmeCoUk: ClientRecordLike = { id: "recAcmeUK", fields: { "Primary Contact Email": "bookings@acme.co.uk" } };
const acmeCo: ClientRecordLike = { id: "recAcmeCo", fields: { "Primary Contact Email": "bob@acme.co" } };
const multi: ClientRecordLike = { id: "recMulti", fields: { Emails: "Jane <jane@travelco.com>, bob@travelco.com" } };

describe("recordEmails", () => {
  it("pulls whole addresses out of bare, angle-bracket, and list fields", () => {
    expect(recordEmails(multi.fields, FIELDS)).toEqual(["jane@travelco.com", "bob@travelco.com"]);
    expect(recordEmails(acmeCoUk.fields, FIELDS)).toEqual(["bookings@acme.co.uk"]);
  });
});

describe("pickExactEmailMatch — equality, never substring", () => {
  it("matches the exact contact address", () => {
    expect(pickExactEmailMatch([acmeCoUk], "bookings@acme.co.uk", FIELDS)?.id).toBe("recAcmeUK");
    expect(pickExactEmailMatch([multi], "bob@travelco.com", FIELDS)?.id).toBe("recMulti");
  });
  it("does NOT match an address that is only a substring/prefix of a contact (the leak)", () => {
    // "bob@acme.co" must never inherit "bob@acme.co.uk"'s company.
    expect(pickExactEmailMatch([acmeCoUk], "bob@acme.co", FIELDS)).toBeNull();
    expect(pickExactEmailMatch([acmeCoUk], "ings@acme.co.uk", FIELDS)).toBeNull();
  });
});

describe("pickDomainMatch — exact domain, never prefix", () => {
  it("matches a colleague at the exact same company domain", () => {
    // Not a listed contact, but same real domain → same company.
    expect(pickDomainMatch([acmeCoUk], "acme.co.uk", FIELDS)?.id).toBe("recAcmeUK");
  });
  it("does NOT match an adjacent domain the client's domain is a prefix of (the .co/.co.uk leak)", () => {
    expect(pickDomainMatch([acmeCoUk], "acme.co", FIELDS)).toBeNull();
    // and the reverse: a .co.uk user must not inherit a .co client
    expect(pickDomainMatch([acmeCo], "acme.co.uk", FIELDS)).toBeNull();
  });
  it("picks the right company when two clients share a domain prefix", () => {
    expect(pickDomainMatch([acmeCo, acmeCoUk], "acme.co.uk", FIELDS)?.id).toBe("recAcmeUK");
    expect(pickDomainMatch([acmeCo, acmeCoUk], "acme.co", FIELDS)?.id).toBe("recAcmeCo");
  });
});
