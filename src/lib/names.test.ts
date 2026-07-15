import { describe, expect, it } from "vitest";
import { bestDisplayName, firstNameFrom, isEmailish, nameFromEmail } from "./names";

describe("nameFromEmail", () => {
  it("recovers a name when the local part splits cleanly", () => {
    expect(nameFromEmail("darren.swan@agendas.group")).toBe("Darren Swan");
    expect(nameFromEmail("john_doe@x.com")).toBe("John Doe");
    expect(nameFromEmail("sam-smith@example.com")).toBe("Sam Smith");
  });
  it("refuses to guess from an unsplittable or numbered local part", () => {
    expect(nameFromEmail("darrenswan@gmail.com")).toBeNull();
    expect(nameFromEmail("louisespeight1@gmail.com")).toBeNull();
    expect(nameFromEmail("darren.swan2@x.com")).toBeNull();
  });
});

describe("firstNameFrom", () => {
  it("derives a first name from a splittable email local-part", () => {
    expect(firstNameFrom("andy.speight@agendas.group")).toBe("Andy");
    expect(firstNameFrom("jane_doe@example.com")).toBe("Jane");
    expect(firstNameFrom("sam-smith@example.com")).toBe("Sam");
  });

  it("never mangles an unsplittable local part into a pseudo-name", () => {
    // "Hi Darrenswan" bug (15 Jul 2026): a single-token local part is not a
    // safe name source — greet neutrally instead.
    expect(firstNameFrom("darrenswan@gmail.com")).toBe("there");
    expect(firstNameFrom("mcDonald@example.com")).toBe("there");
  });

  it("uses the first token of a display name", () => {
    expect(firstNameFrom("Andy Speight")).toBe("Andy");
    expect(firstNameFrom("andy")).toBe("Andy");
  });

  it("falls back to 'there' for empty or unusable input", () => {
    expect(firstNameFrom("")).toBe("there");
    expect(firstNameFrom("   ")).toBe("there");
    expect(firstNameFrom(null)).toBe("there");
    expect(firstNameFrom(undefined)).toBe("there");
    expect(firstNameFrom("@example.com")).toBe("there");
  });
});

describe("bestDisplayName", () => {
  it("prefers a real name, recovers from the email, else null", () => {
    expect(bestDisplayName("Darren Swan", "darrenswan@gmail.com")).toBe("Darren Swan");
    expect(bestDisplayName("darrenswan@gmail.com", "darren.swan@x.com")).toBe("Darren Swan");
    expect(bestDisplayName("darrenswan@gmail.com", "darrenswan@gmail.com")).toBeNull();
    expect(bestDisplayName("", "darrenswan@gmail.com")).toBeNull();
  });
});

describe("isEmailish", () => {
  it("spots emails and not names", () => {
    expect(isEmailish("a@b.com")).toBe(true);
    expect(isEmailish("Darren Swan")).toBe(false);
    expect(isEmailish("")).toBe(false);
    expect(isEmailish(null)).toBe(false);
  });
});
