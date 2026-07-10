// Pure QA-verdict type + parser, kept free of server-only/SDK imports so it stays
// unit-testable. The async judge (qa-judge.ts) builds on this.

export type QaVerdict = {
  verdict: "pass" | "flag";
  commercialCommitment: boolean;
  onBrand: boolean;
  addressesQuestion: boolean;
  grounded: boolean;
  issues: string[];
  note: string;
};

const PASS: QaVerdict = {
  verdict: "pass",
  commercialCommitment: false,
  onBrand: true,
  addressesQuestion: true,
  grounded: true,
  issues: [],
  note: "",
};

/** Parse the judge's JSON. Any dimension failing means the reply is flagged.
 *  Fail-open to a pass on malformed output (never false-flag on a hiccup). */
export function parseQaVerdict(raw: string): QaVerdict {
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const p = JSON.parse(json) as Record<string, unknown>;
    const commercialCommitment = p.commercial_commitment === true;
    const onBrand = p.on_brand !== false;
    const addressesQuestion = p.addresses_question !== false;
    const grounded = p.grounded !== false;
    const issues = Array.isArray(p.issues)
      ? p.issues.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 5)
      : [];
    const failed = commercialCommitment || !onBrand || !addressesQuestion || !grounded;
    return {
      verdict: failed ? "flag" : "pass",
      commercialCommitment,
      onBrand,
      addressesQuestion,
      grounded,
      issues,
      note: typeof p.note === "string" ? p.note.slice(0, 500) : "",
    };
  } catch {
    return PASS;
  }
}
