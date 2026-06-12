import type { EscalationCategory } from "./types";

// Deterministic guardrails that run regardless of what the model decides.
// Inbound: topics that must never be AI-handled (brief §6 — non-negotiable).
// Outbound: commitments the AI must never send.

const MANDATORY_ESCALATIONS: { category: EscalationCategory; patterns: RegExp[] }[] = [
  {
    category: "human_requested",
    patterns: [
      /\b(speak|talk)\s+(to|with)\s+(a\s+|an\s+|some)?(human|person|real\s+person|agent|manager|someone)\b/i,
      /\breal\s+(person|human)\b/i,
      /\b(call|phone|ring)\s+me\b/i,
      /\bstop\s+(the\s+)?(bot|ai|robot)\b/i,
    ],
  },
  {
    category: "commercial_or_billing",
    patterns: [
      /\brefund(s|ed|ing)?\b/i,
      /\breimburs\w*/i,
      /\bcompensat\w*/i,
      /\bcredit\s+note\b/i,
      /\bchargeback\b/i,
      /\bdiscount\w*/i,
      /\binvoice\w*/i,
      /\bbilling\b/i,
      /\bdirect\s+debit\b/i,
      /\bovercharg\w*/i,
      /\bcontract\b/i,
      /\brenewal\b/i,
      /cancel\w*\s+(my|our)\s+(account|subscription|contract|plan)/i,
    ],
  },
  {
    category: "legal",
    patterns: [
      /\blegal\s+(action|advice|team|department)\b/i,
      /\bsolicitor\b|\blawyer\b|\battorney\b/i,
      /\bgdpr\b/i,
      /\bsubject\s+access\s+request\b/i,
      /\bdata\s+(deletion|removal|erasure)\b/i,
      /\bsue\b|\bsuing\b|\blawsuit\b/i,
    ],
  },
];

export function mandatoryEscalation(text: string): { category: EscalationCategory; matched: string } | null {
  for (const group of MANDATORY_ESCALATIONS) {
    for (const pattern of group.patterns) {
      const match = text.match(pattern);
      if (match) return { category: group.category, matched: match[0] };
    }
  }
  return null;
}

const OUTBOUND_COMMITMENTS: RegExp[] = [
  /\b(we|i)\s+(will|'ll|shall|can|are\s+going\s+to)\s+\w{0,12}\s*(refund|reimburse|credit|discount|waive|compensate)/i,
  /\byou\s+(will|'ll)\s+(be\s+)?(refunded|reimbursed|credited|compensated)\b/i,
  /\b(issue|process|arrange)\w*\s+(a\s+)?(refund|credit\s+note|reimbursement)\b/i,
  /\bwaive\s+(the\s+)?(fee|charge|cost)\b/i,
];

/** True if a drafted customer reply contains a commercial commitment. */
export function violatesCommercialGuardrail(reply: string): boolean {
  return OUTBOUND_COMMITMENTS.some((pattern) => pattern.test(reply));
}
