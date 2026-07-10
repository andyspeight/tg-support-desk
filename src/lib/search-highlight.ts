// Pure helpers for the search UI: safe rendering of the DB's ts_headline output
// and date-range → timestamp mapping. No server deps, so they stay unit-testable
// and importable from the client component.

// The search RPC wraps matched terms in these markers (chosen so they can't
// clash with real content); the UI splits on them and renders hits in <mark>,
// never as HTML — so a match snippet can't inject markup.
export const HL_START = "⟦";
export const HL_STOP = "⟧";

export type Segment = { text: string; hit: boolean };

/** Split ts_headline output ("…⟦term⟧…") into plain / highlighted segments. */
export function splitHighlight(text: string): Segment[] {
  if (!text) return [];
  const out: Segment[] = [];
  const re = /⟦([\s\S]*?)⟧/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), hit: false });
    out.push({ text: match[1], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export type DateRange = "any" | "24h" | "7d" | "30d";

/** Map a date-range choice to an ISO "updated since" timestamp (null = any time). */
export function sinceForRange(range: DateRange, now: number): string | null {
  const day = 86_400_000;
  if (range === "24h") return new Date(now - day).toISOString();
  if (range === "7d") return new Date(now - 7 * day).toISOString();
  if (range === "30d") return new Date(now - 30 * day).toISOString();
  return null;
}
