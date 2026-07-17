// Pull a one-line gist out of an AI handover note, so the ticket view can show a
// compact summary with the full package one click away. Pure + unit-tested.

const SECTION_LABELS = ["Diagnosis", "Steps tried", "Suggested reply", "Category", "Reason", "Evidence"];
const isLabelLine = (line: string) =>
  /^AI HANDOVER$/i.test(line) || SECTION_LABELS.some((l) => new RegExp(`^${l}\\s*:`, "i").test(line));

/**
 * The gist of a handover: the first line of its Diagnosis section — why the AI
 * handed this to a human. Falls back to the first meaningful line, then a neutral
 * default, so a note that isn't in the expected shape still yields something sane.
 */
export function handoverDiagnosis(body: string): string {
  const match = body.match(/Diagnosis:[ \t]*\n?[ \t]*([^\n]+)/i);
  const line = match?.[1]?.trim();
  if (line) return line;
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (l && !isLabelLine(l)) return l;
  }
  return "Escalated to a human — open for the full handover.";
}

/** Trim to a max length on a word boundary, adding an ellipsis when cut. */
export function truncate(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
