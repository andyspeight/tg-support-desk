import { addBusinessMinutes, DEFAULT_CALENDAR, type BusinessCalendar } from "./sla";

// Pure decision for the "client not responding" chase on waiting-on-customer
// tickets. No server/env imports so it stays unit-testable. Timing is
// business-hours aware (reuses the SLA calendar) so a reminder/close never
// lands over a weekend. A reminder always precedes a close.

export type InactivityDecision = "remind" | "close" | "none";

export function decideInactivityAction(args: {
  /** When the customer last said anything on the ticket (ms). */
  lastCustomerMs: number;
  /** True if the customer's message is the most recent on the ticket (they replied). */
  lastMessageFromCustomer: boolean;
  /** When our inactivity reminder went out, if one has since the last customer message. */
  reminderMs: number | null;
  nowMs: number;
  remindDays: number;
  closeDays: number;
  cal?: BusinessCalendar;
}): InactivityDecision {
  // The customer has replied — hands off; the AI/agent picks it up, not the chaser.
  if (args.lastMessageFromCustomer) return "none";

  const cal = args.cal ?? DEFAULT_CALENDAR;
  const workdayMin = (cal.endHour - cal.startHour) * 60;

  // Already reminded → close once the post-reminder grace has elapsed, so the
  // customer always gets a fair window after the nudge (even on old tickets).
  if (args.reminderMs !== null) {
    const graceMin = Math.max(1, args.closeDays - args.remindDays) * workdayMin;
    return args.nowMs >= addBusinessMinutes(args.reminderMs, graceMin, cal) ? "close" : "none";
  }

  const remindMin = Math.max(1, args.remindDays) * workdayMin;
  return args.nowMs >= addBusinessMinutes(args.lastCustomerMs, remindMin, cal) ? "remind" : "none";
}
