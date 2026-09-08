// The AI has no tool that hands work to a colleague. It has search_kb,
// get_client_context, search_past_tickets, send_reply and escalate — nothing
// that logs a feature request, raises a roadmap question, or puts a ticket in
// front of a human.
//
// The system prompt nevertheless teaches it to write "I've passed this to the
// team with the details" (the acknowledge-don't-commit rule), and that reading
// is right: it commits us to nothing. But it is only harmless if it is TRUE.
// A reply that says it has passed something on, sent on a ticket that then
// closes as ai_resolved, is a statement about something that never happened —
// and the outstanding points end up owned by nobody.
//
// Real example, ticket #8464: the AI correctly explained what Order Manager
// does today, then wrote "I've logged both with the team as feature requests"
// and "I've passed that question on as well" — and the ticket closed 34 seconds
// after it arrived. Nothing was logged and nobody was told.
//
// So this is the deterministic backstop: when a reply claims a handover, the
// desk performs one — the ticket goes to a human instead of closing. The claim
// becomes true, and the remainder keeps an owner.

type Rule = { label: string; re: RegExp };

const ACTOR = String.raw`(?:I(?:'ve| have)|We(?:'ve| have))`;
const HANDOFF_VERB = String.raw`(?:passed|logged|raised|flagged|forwarded|shared|referred|reported|escalated|noted)`;
/** Who the work is claimed to have gone to — a colleague, never the customer. */
const COLLEAGUE = String.raw`(?:(?:the|our|my)\s+)?(?:team|teams|product\s+team|dev(?:elopment)?\s+team|developers?|engineers?|right\s+people|colleagues?|specialists?|support\s+team|product\s+owners?)`;

const RULES: Rule[] = [
  {
    // "I've passed this to the team", "I've logged both with the team as feature requests"
    label: "handed-to-a-colleague",
    re: new RegExp(String.raw`\b${ACTOR}\s+(?:already\s+)?${HANDOFF_VERB}\b[^.!?]{0,100}?\b(?:to|with)\s+${COLLEAGUE}\b`, "i"),
  },
  {
    // "I've passed that question on", "I've put this forward"
    label: "passed-on",
    re: new RegExp(String.raw`\b${ACTOR}\s+(?:passed|put)\b[^.!?]{0,60}?\b(?:on|forward|onward)\b`, "i"),
  },
  {
    // "I've logged both as feature requests", "I've recorded this as a suggestion"
    label: "logged-a-request",
    re: new RegExp(
      String.raw`\b${ACTOR}\s+(?:${HANDOFF_VERB}|recorded|submitted)\b[^.!?]{0,80}?\b(?:feature\s+request|enhancement|suggestion)\b`,
      "i",
    ),
  },
];

export type Deferral = { label: string; sentence: string };

/** Split into sentences so a match can be quoted back to the agent picking the
 *  ticket up — "here is exactly what the customer was told". */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The sentences in a customer-facing reply that claim work has been handed to a
 * colleague. Each one is something the desk must now actually make true.
 */
export function findDeferrals(text: string): Deferral[] {
  if (!text?.trim()) return [];
  const out: Deferral[] = [];
  for (const sentence of sentences(text)) {
    const rule = RULES.find((r) => r.re.test(sentence));
    if (rule) out.push({ label: rule.label, sentence });
  }
  return out;
}

/** True when the reply tells the customer someone else now has part of this —
 *  so the ticket has an outstanding item and must not close. */
export function claimsHandover(text: string): boolean {
  return findDeferrals(text).length > 0;
}
