import { describe, expect, it } from "vitest";
import { SAFE_CLIENT_FIELDS, SENSITIVE_FIELD_RE, summariseClientFields } from "./client-summary";

describe("summariseClientFields", () => {
  it("renders allowlisted identity fields", () => {
    const out = summariseClientFields({
      id: "rec123",
      fields: {
        ClientName: "Sunshine Travel",
        Plan: "Boost",
        Status: "Active",
        "Travelify App ID": 250,
        "Primary Contact Name": "Jane Doe",
      },
    });
    expect(out).toContain("Airtable client record: rec123");
    expect(out).toContain("ClientName: Sunshine Travel");
    expect(out).toContain("Plan: Boost");
    expect(out).toContain("Travelify App ID: 250");
    expect(out).toContain("Primary Contact Name: Jane Doe");
  });

  it("never leaks credential-grade or non-allowlisted fields into the prompt", () => {
    const out = summariseClientFields({
      id: "rec1",
      fields: {
        ClientName: "Acme Travel",
        ClientCode: "hunter2", // client login password
        "API Key": "A41D180E-CBFE-4E30-A47D", // Travelify API key
        Email: "ops@acme.com",
        Notes: "internal commentary",
        MRR: 499,
      },
    });
    expect(out).toContain("ClientName: Acme Travel");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("ClientCode");
    expect(out).not.toContain("A41D180E");
    expect(out).not.toContain("API Key");
    expect(out).not.toContain("internal commentary"); // Notes not allowlisted
    expect(out).not.toContain("499"); // MRR not allowlisted (commercially sensitive)
  });

  it("drops empty values and linked-record arrays", () => {
    const out = summariseClientFields({
      id: "rec2",
      fields: {
        ClientName: "Beta Co",
        Status: "", // empty -> skipped
      },
    });
    expect(out).toContain("ClientName: Beta Co");
    expect(out).not.toMatch(/Status:/);
  });

  it("backstop: SENSITIVE_FIELD_RE catches secret-shaped names but never a safe allowlist field", () => {
    for (const f of ["ClientCode", "API Key", "ApiKeyEncrypted", "Password Hash", "Auth Token", "Client Secret"]) {
      expect(SENSITIVE_FIELD_RE.test(f)).toBe(true);
    }
    for (const f of SAFE_CLIENT_FIELDS) {
      expect(SENSITIVE_FIELD_RE.test(f)).toBe(false);
    }
  });
});
