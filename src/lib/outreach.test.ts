import { describe, it, expect } from "vitest";
import { parseRecipients, greetingName, personaliseOutreach } from "./outreach";

describe("parseRecipients", () => {
  it("parses a bare email", () => {
    expect(parseRecipients("jo@acme.com")).toEqual([{ email: "jo@acme.com" }]);
  });

  it("parses 'Name <email>'", () => {
    expect(parseRecipients("Jo Bloggs <Jo@Acme.com>")).toEqual([{ email: "jo@acme.com", name: "Jo Bloggs" }]);
  });

  it("parses 'email, Name' and 'Name, email'", () => {
    expect(parseRecipients("jo@acme.com, Jo Bloggs")).toEqual([{ email: "jo@acme.com", name: "Jo Bloggs" }]);
    expect(parseRecipients("Jo Bloggs, jo@acme.com")).toEqual([{ email: "jo@acme.com", name: "Jo Bloggs" }]);
  });

  it("handles multiple lines and skips blanks/invalid", () => {
    const raw = "jo@acme.com\n\nnot-an-email\nSam <sam@beta.io>";
    expect(parseRecipients(raw)).toEqual([{ email: "jo@acme.com" }, { email: "sam@beta.io", name: "Sam" }]);
  });

  it("dedupes on email case-insensitively, keeping the first", () => {
    const raw = "Jo <jo@acme.com>\njo@ACME.com";
    expect(parseRecipients(raw)).toEqual([{ email: "jo@acme.com", name: "Jo" }]);
  });
});

describe("greetingName", () => {
  it("returns the first name", () => {
    expect(greetingName("Jo Bloggs")).toBe("Jo");
  });
  it("falls back to 'there'", () => {
    expect(greetingName(null)).toBe("there");
    expect(greetingName("   ")).toBe("there");
  });
});

describe("personaliseOutreach", () => {
  it("replaces every {{name}} token", () => {
    expect(personaliseOutreach("Hi {{name}}, thanks {{name}}", "Jo Bloggs")).toBe("Hi Jo, thanks Jo");
  });
  it("uses 'there' when no name", () => {
    expect(personaliseOutreach("Hi {{name}},", undefined)).toBe("Hi there,");
  });
});
