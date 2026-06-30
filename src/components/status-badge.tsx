import type { TicketPriority, TicketStatus } from "@/lib/db/types";

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25" },
  ai_working: { label: "AI working", className: "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/25" },
  waiting_on_customer: { label: "Waiting on customer", className: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25" },
  pending: { label: "Pending", className: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25" },
  awaiting_approval: { label: "Pending approval", className: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/25" },
  escalated: { label: "Escalated", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25" },
  closed: { label: "Closed", className: "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-500/25" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}>
      {style.label}
    </span>
  );
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  p1: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
  p2: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  p3: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-500/25",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase ring-1 ring-inset ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}
