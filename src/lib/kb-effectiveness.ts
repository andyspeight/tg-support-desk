// Pure KB-effectiveness aggregation — no env / no DB, so it stays unit-testable.
// Turns raw article→ticket usage rows into per-article performance, and flags
// articles that resolve well (workhorse) vs. ones that get surfaced but don't
// land (review). The self-correcting half of the KB loop.

export type KbUsageRow = {
  article_id: string;
  /** Did this article's source link appear in the reply actually sent? */
  cited: boolean;
  /** Live state of the ticket it was used on (null if the ticket is gone). */
  ticket: { ai_resolved: boolean | null; status: string | null; csat_score: number | null } | null;
};

export type KbEffectiveness = {
  article_id: string;
  /** Times retrieved by search_kb on a ticket. */
  surfaced: number;
  /** Times its link made it into a sent reply. */
  cited: number;
  /** Of cited tickets, how many the AI actually resolved (and stayed resolved). */
  resolved: number;
  /** Of cited tickets, how many got a negative CSAT (< 3). */
  negativeCsat: number;
  /** Mean CSAT over cited tickets that were rated, or null if none. */
  avgCsat: number | null;
  /** resolved / cited, 0–100, or null if never cited. */
  resolveRate: number | null;
};

export function aggregateKbEffectiveness(rows: KbUsageRow[]): Map<string, KbEffectiveness> {
  const acc = new Map<
    string,
    { surfaced: number; cited: number; resolved: number; negativeCsat: number; csatSum: number; csatCount: number }
  >();

  for (const r of rows) {
    const cur = acc.get(r.article_id) ?? { surfaced: 0, cited: 0, resolved: 0, negativeCsat: 0, csatSum: 0, csatCount: 0 };
    cur.surfaced += 1;
    if (r.cited) {
      cur.cited += 1;
      const t = r.ticket;
      if (t) {
        if (t.ai_resolved && (t.status === "resolved" || t.status === "closed")) cur.resolved += 1;
        if (typeof t.csat_score === "number") {
          cur.csatSum += t.csat_score;
          cur.csatCount += 1;
          if (t.csat_score < 3) cur.negativeCsat += 1;
        }
      }
    }
    acc.set(r.article_id, cur);
  }

  const out = new Map<string, KbEffectiveness>();
  for (const [article_id, v] of acc) {
    out.set(article_id, {
      article_id,
      surfaced: v.surfaced,
      cited: v.cited,
      resolved: v.resolved,
      negativeCsat: v.negativeCsat,
      avgCsat: v.csatCount ? Math.round((v.csatSum / v.csatCount) * 10) / 10 : null,
      resolveRate: v.cited ? Math.round((v.resolved / v.cited) * 100) : null,
    });
  }
  return out;
}

/**
 * Verdict on an article, once it has enough signal (≥ 3 cited tickets):
 * - "review": it gets used but doesn't land (any negative CSAT, or < 50% resolve) → fix or retire.
 * - "workhorse": ≥ 80% resolve and no negative CSAT → keep it fresh.
 * Below the signal threshold we don't judge (null).
 */
export function kbArticleFlag(e: KbEffectiveness): "workhorse" | "review" | null {
  if (e.cited < 3 || e.resolveRate === null) return null;
  if (e.negativeCsat > 0 || e.resolveRate < 50) return "review";
  if (e.resolveRate >= 80) return "workhorse";
  return null;
}
