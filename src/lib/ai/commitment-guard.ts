// The AI answers in seconds, which is the point — but it must never promise
// something Travelgenix then has to live up to. Reported examples: "a member of
// the team will fix it and get back to you", "we will get that added for you",
// "we will be back to you shortly" (sent at a weekend, when it wouldn't be).
//
// The system prompt tells the agent to acknowledge without committing; this is
// the deterministic backstop, because a prompt instruction alone is not a
// guarantee. A reply that trips these rules is never auto-sent — it's held as a
// draft for a human, who can decide what we actually promise.

type Rule = { label: string; re: RegExp };

/** Someone/something other than "me, right now" being committed to an action —
 *  the AI cannot speak for a colleague or for the team. */
const THIRD_PARTY = /\b(?:the team|a member of (?:the )?team|(?:one of )?my colleagues?|a colleague|someone|somebody|they|we)\s+(?:will|'ll|shall|are going to|is going to|would)\b/i;

/** Promising an outcome: that a fix, change or addition WILL happen. */
const OUTCOME =
  /\b(?:will|'ll|shall|going to)\s+(?:be\s+)?(?:able to\s+)?(?:get\s+(?:it|that|this)\s+)?(?:fix|fixed|resolve|resolved|sort|sorted|add|added|implement|implemented|change|changed|amend|amended|correct|corrected|update|updated|create|created|build|built|enable|enabled|configure|configured|activate|activated|install|installed|remove|removed|restore|restored)\b|\b(?:get|getting|have)\s+(?:it|that|this)\s+(?:fixed|added|sorted|resolved|changed|updated|done|enabled|created)\b/i;

/** Promising when: any timeframe or urgency we can't stand behind, especially
 *  out of hours. Bare "today"/"tomorrow" are deliberately excluded — they appear
 *  far too often in ordinary factual sentences to flag on their own. */
const TIMEFRAME =
  /\b(?:shortly|asap|a\.s\.a\.p\.|as soon as (?:possible|we can|i can|they can)|right away|straight away|immediately|momentarily|in a moment|in a few (?:minutes|hours)|first thing|by (?:the )?(?:end of (?:the )?(?:day|week|play)|close of (?:play|business)|cob)|within (?:the )?(?:next )?(?:\d+|a|one|two|three|four|five|24|48|72)\s*(?:minute|hour|day|working day|business day|week)s?|in the next (?:\d+|few)\s*(?:minute|hour|day)s?)\b/i;

/** Guarantees and assurances — we don't give them. */
const GUARANTEE = /\b(?:guarantee[ds]?|guaranteeing|i promise|we promise|rest assured|you have my word|definitely will|certainly will)\b/i;

const RULES: Rule[] = [
  { label: "timeframe", re: TIMEFRAME },
  { label: "promised-outcome", re: OUTCOME },
  { label: "commits-a-colleague", re: THIRD_PARTY },
  { label: "guarantee", re: GUARANTEE },
];

/**
 * Which commitment rules a customer-facing reply trips, as labels. Empty when
 * the reply only acknowledges (e.g. "I've passed this to the team with the
 * details") — past/present statements of fact commit us to nothing.
 */
export function findCommitments(text: string): string[] {
  if (!text?.trim()) return [];
  return RULES.filter((r) => r.re.test(text)).map((r) => r.label);
}

/** True when the reply promises an outcome, a timeframe, a colleague's action,
 *  or a guarantee — i.e. it must not be sent without a human deciding. */
export function hasCommitment(text: string): boolean {
  return findCommitments(text).length > 0;
}
