// Client-only coordination between the reply composer and the background
// refresh poller.
//
// The problem: RefreshPoller calls router.refresh() on an interval. When a new
// Vercel deployment is live, Next.js's deployment-skew protection turns the next
// refresh into a full page reload to pick up fresh chunks — which wipes any
// unsent text an agent is typing. While a composer holds a draft we hold the
// poller off, and the composer also persists its text to localStorage as a
// belt-and-braces safety net (see reply-box.tsx).
//
// Module-level state is fine here: on the client this module is a singleton, and
// both the poller and every composer import the same instance.

const dirty = new Set<string>();

/** Mark (or clear) a composer as holding unsent text. Keyed by ticket id so
 *  mount/unmount churn can't leave a stale "dirty" flag stuck on. */
export function markDraftDirty(id: string, isDirty: boolean): void {
  if (isDirty) dirty.add(id);
  else dirty.delete(id);
}

/** True while any composer on the page holds an unsent draft — the poller
 *  checks this before refreshing so it never yanks the page mid-reply. */
export function anyDraftDirty(): boolean {
  return dirty.size > 0;
}
