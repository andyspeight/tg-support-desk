// Safety net for the agent copilot's rewrite tools (rephrase / pre-send
// review). Those tools must only re-word an agent's draft — warmer, clearer,
// more professional — never change what it actually says. The reported failure
// was a reversal: "No, we can't do that" came back as "Yes, we can. Please send
// more information." This catches the worst, clearest case of that so a flipped
// reply is never handed back to the agent.

// Clear negation / refusal markers. Contractions (can't, won't, isn't…) are
// matched via the n't tail so we don't have to list every verb.
const NEGATION = /\b(no|not|never|cannot|unable|impossible|none|neither|nor)\b|\bcan\s?not\b|n[’']t\b/i;

/** Does the text carry a negation or refusal? */
export function hasNegation(text: string): boolean {
  return NEGATION.test(text);
}

/**
 * Conservative check that a "warmer" rewrite may have flipped a refusal into an
 * acceptance. Fires ONLY when the original carries a negation/refusal and the
 * rewrite has none at all — so a faithful rewrite (which keeps some negation,
 * e.g. "that isn't something we can do") is never suppressed. On a hit the
 * caller keeps the agent's own words: declining to re-word is a safe outcome;
 * silently reversing a "no" into a "yes" is not.
 */
export function reversesStance(original: string, rewrite: string): boolean {
  if (!original?.trim() || !rewrite?.trim()) return false;
  return hasNegation(original) && !hasNegation(rewrite);
}
