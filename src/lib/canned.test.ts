import { describe, it, expect } from "vitest";
import { applyCannedVars } from "./canned";

describe("applyCannedVars", () => {
  it("substitutes known tokens", () => {
    expect(
      applyCannedVars("Hi {{first_name}}, re {{ticket}} — {{agent}}", {
        first_name: "Sam",
        ticket: "#42",
        agent: "Alice",
      }),
    ).toBe("Hi Sam, re #42 — Alice");
  });

  it("tolerates spacing and case in tokens", () => {
    expect(applyCannedVars("Hi {{ First_Name }}", { first_name: "Sam" })).toBe("Hi Sam");
  });

  it("leaves unknown tokens untouched", () => {
    expect(applyCannedVars("Hi {{company}}", { first_name: "Sam" })).toBe("Hi {{company}}");
  });

  it("leaves a known token untouched when its value is missing", () => {
    expect(applyCannedVars("Hi {{first_name}}", {})).toBe("Hi {{first_name}}");
  });
});
