import type { TicketPriority, TicketStatus } from "@/lib/db/types";

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  ai_working: { label: "AI working", className: "bg-violet-50 text-violet-700 ring-violet-200" },
  waiting_on_customer: { label: "Waiting on customer", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  escalated: { label: "Escalated", className: "bg-red-50 text-red-700 ring-red-200" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  closed: { label: "Closed", className: "bg-zinc-100 text-zinc-500 ring-zinc-200" },
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
  p1: "bg-red-50 text-red-700 ring-red-200",
  p2: "bg-amber-50 text-amber-700 ring-amber-200",
  p3: "bg-zinc-50 text-zinc-600 ring-zinc-200",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase ring-1 ring-inset ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}
