// Client-friendly ticket status labels for the support portal — clients see
// plain progress words, not the internal status enum.
export function clientStatus(status: string): { label: string; tone: string } {
  switch (status) {
    case "new":
      return { label: "Received", tone: "bg-surface-2 text-ink-2" };
    case "ai_working":
      return { label: "Working on it", tone: "bg-accent-500/10 text-accent-700 dark:text-accent-300" };
    case "waiting_on_customer":
      return { label: "Awaiting your reply", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
    case "escalated":
      return { label: "With the team", tone: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" };
    case "resolved":
      return { label: "Resolved", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" };
    case "closed":
      return { label: "Closed", tone: "bg-surface-2 text-ink-3" };
    case "pending":
      return { label: "In progress", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" };
    case "awaiting_supplier":
      // Blocked on a third party — the customer just needs to know it's in hand,
      // not the internal supplier detail.
      return { label: "In progress", tone: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" };
    case "awaiting_approval":
      return { label: "Received", tone: "bg-surface-2 text-ink-2" };
    case "needs_review":
      // A reply is drafted and a person is finalising it — don't expose internals.
      return { label: "Working on it", tone: "bg-accent-500/10 text-accent-700 dark:text-accent-300" };
    default:
      return { label: status, tone: "bg-surface-2 text-ink-2" };
  }
}
