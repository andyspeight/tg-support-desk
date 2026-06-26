import { describe, expect, it } from "vitest";
import { firstNameFrom } from "./names";

describe("firstNameFrom", () => {
  it("derives a first name from an email local-part", () => {
    expect(firstNameFrom("andy.speight@agendas.group")).toBe("Andy");
    expect(firstNameFrom("jane_doe@example.com")).toBe("Jane");
    expect(firstNameFrom("sam-smith@example.com")).toBe("Sam");
  });

  it("uses the first token of a display name", () => {
    expect(firstNameFrom("Andy Speight")).toBe("Andy");
    expect(firstNameFrom("andy")).toBe("Andy");
  });

  it("capitalises only the first letter, preserving the rest", () => {
    expect(firstNameFrom("mcDonald@example.com")).toBe("McDonald");
  });

  it("falls back to 'there' for empty or unusable input", () => {
    expect(firstNameFrom("")).toBe("there");
    expect(firstNameFrom("   ")).toBe("there");
    expect(firstNameFrom(null)).toBe("there");
    expect(firstNameFrom(undefined)).toBe("there");
    expect(firstNameFrom("@example.com")).toBe("there");
  });
});
