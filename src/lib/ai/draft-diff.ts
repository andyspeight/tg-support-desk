// How much did a human change the AI's draft before sending? This is the
// learning signal: "sent as-is" says the AI was right; a heavy rewrite says it
// was wrong and the human's version is the lesson. Pure + unit-tested.

export type EditClass = "as_sent" | "light_edit" | "heavy_edit" | "discarded";

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "") // drop punctuation so wording, not commas, drives the score
    .trim();

const tokens = (s: string): Set<string> => new Set(normalise(s).split(" ").filter(Boolean));

/**
 * Word-set (Jaccard) overlap between the AI draft and what the human sent —
 * order-insensitive, so reordered sentences still read as "similar". Returns the
 * similarity (0–1) and a coarse edit class used to decide whether this is a
 * correction worth mining into the KB.
 */
export function classifyEdit(draft: string, sent: string): { similarity: number; editClass: EditClass } {
  const a = tokens(draft);
  const b = tokens(sent);
  if (a.size === 0) return { similarity: 0, editClass: "discarded" };

  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  const similarity = union === 0 ? 1 : inter / union;

  const editClass: EditClass =
    similarity >= 0.9 ? "as_sent" : similarity >= 0.6 ? "light_edit" : similarity >= 0.2 ? "heavy_edit" : "discarded";
  return { similarity, editClass };
}

/** A material change — the AI got it substantially wrong, so the human's version
 *  is worth capturing as a KB candidate. */
export function isMaterialEdit(editClass: EditClass): boolean {
  return editClass === "heavy_edit" || editClass === "discarded";
}
