import { describe, it, expect } from "vitest";
import { parseQaVerdict } from "./qa-verdict";

describe("parseQaVerdict", () => {
  it("passes a clean reply", () => {
    const v = parseQaVerdict('{"commercial_commitment":false,"grounded":true,"addresses_question":true,"on_brand":true,"issues":[],"note":""}');
    expect(v.verdict).toBe("pass");
    expect(v.issues).toEqual([]);
  });

  it("flags a commercial commitment", () => {
    const v = parseQaVerdict('{"commercial_commitment":true,"grounded":true,"addresses_question":true,"on_brand":true,"issues":["promised a refund"],"note":"offered money back"}');
    expect(v.verdict).toBe("flag");
    expect(v.commercialCommitment).toBe(true);
    expect(v.issues).toEqual(["promised a refund"]);
  });

  it("flags when any dimension fails", () => {
    expect(parseQaVerdict('{"grounded":false}').verdict).toBe("flag");
    expect(parseQaVerdict('{"addresses_question":false}').verdict).toBe("flag");
    expect(parseQaVerdict('{"on_brand":false}').verdict).toBe("flag");
  });

  it("defaults missing booleans to the safe value (pass)", () => {
    const v = parseQaVerdict("{}");
    expect(v.verdict).toBe("pass");
    expect(v.onBrand).toBe(true);
    expect(v.commercialCommitment).toBe(false);
  });

  it("tolerates surrounding prose and fails open on garbage", () => {
    expect(parseQaVerdict('here you go: {"on_brand":false} done').verdict).toBe("flag");
    expect(parseQaVerdict("not json at all").verdict).toBe("pass");
  });
});
