// Pure SLA maths — no server/env imports so it stays unit-testable.
// Business-hours aware: targets count only working time in a configured
// timezone. AI responds instantly regardless; SLAs govern human handling.

export type BusinessCalendar = {
  timeZone: string; // IANA, e.g. "Europe/London"
  workDays: number[]; // 0=Sun … 6=Sat
  startHour: number; // inclusive, local wall-clock
  endHour: number; // exclusive, local wall-clock
};

export const DEFAULT_CALENDAR: BusinessCalendar = {
  timeZone: "Europe/London",
  workDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonedParts(ms: number, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

// Offset (ms) to add to a UTC instant to get wall-clock in tz, at that instant.
function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // round the source to the minute to avoid seconds noise
  return asUtc - Math.floor(ms / 60000) * 60000;
}

// Convert a wall-clock time in tz to a UTC instant (ms).
function wallClockToMs(year: number, month1: number, day: number, hour: number, minute: number, tz: string): number {
  const guess = Date.UTC(year, month1 - 1, day, hour, minute);
  const offset = tzOffsetMs(guess, tz);
  return guess - offset;
}

function isWorkday(weekday: number, cal: BusinessCalendar): boolean {
  return cal.workDays.includes(weekday);
}

// Start of the next working window at or after `ms`.
function nextWindowStart(ms: number, cal: BusinessCalendar): number {
  let cursor = ms;
  for (let i = 0; i < 366 * 2; i++) {
    const p = zonedParts(cursor, cal.timeZone);
    if (isWorkday(p.weekday, cal)) {
      const windowStart = wallClockToMs(p.year, p.month, p.day, cal.startHour, 0, cal.timeZone);
      const windowEnd = wallClockToMs(p.year, p.month, p.day, cal.endHour, 0, cal.timeZone);
      if (ms < windowStart) return windowStart;
      if (ms >= windowStart && ms < windowEnd) return ms;
    }
    // advance to start of next calendar day in tz
    const p2 = zonedParts(cursor, cal.timeZone);
    const nextMidnight = wallClockToMs(p2.year, p2.month, p2.day, 0, 0, cal.timeZone) + 24 * 3600 * 1000;
    cursor = nextMidnight;
  }
  return ms; // pathological fallback
}

/** Add `minutes` of business time to a starting instant; returns the due instant (ms). */
export function addBusinessMinutes(startMs: number, minutes: number, cal: BusinessCalendar = DEFAULT_CALENDAR): number {
  let remaining = minutes;
  let cursor = nextWindowStart(startMs, cal);
  let guard = 0;
  while (remaining > 0 && guard++ < 10000) {
    const p = zonedParts(cursor, cal.timeZone);
    const windowEnd = wallClockToMs(p.year, p.month, p.day, cal.endHour, 0, cal.timeZone);
    const availMin = Math.floor((windowEnd - cursor) / 60000);
    if (availMin <= 0) {
      cursor = nextWindowStart(windowEnd, cal);
      continue;
    }
    const take = Math.min(remaining, availMin);
    cursor += take * 60000;
    remaining -= take;
    if (remaining > 0) cursor = nextWindowStart(cursor, cal);
  }
  return cursor;
}

export function dueAt(startIso: string, minutes: number, businessHours: boolean, cal: BusinessCalendar = DEFAULT_CALENDAR): number {
  const start = new Date(startIso).getTime();
  return businessHours ? addBusinessMinutes(start, minutes, cal) : start + minutes * 60000;
}

export type ClockState = "met" | "late" | "pending" | "breached";

/** Resolve a single deadline given whether/when it was satisfied. */
export function clockState(dueMs: number, satisfiedIso: string | null, nowMs: number): ClockState {
  if (satisfiedIso) return new Date(satisfiedIso).getTime() <= dueMs ? "met" : "late";
  return nowMs <= dueMs ? "pending" : "breached";
}

export type TicketSla = {
  firstResponse: { dueMs: number; state: ClockState };
  resolve: { dueMs: number; state: ClockState };
  breaching: boolean;
};

export function ticketSla(args: {
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  firstResponseMinutes: number;
  resolveMinutes: number;
  businessHours: boolean;
  nowMs?: number;
  cal?: BusinessCalendar;
}): TicketSla {
  const now = args.nowMs ?? Date.now();
  const cal = args.cal ?? DEFAULT_CALENDAR;
  const frDue = dueAt(args.createdAt, args.firstResponseMinutes, args.businessHours, cal);
  const reDue = dueAt(args.createdAt, args.resolveMinutes, args.businessHours, cal);
  const firstResponse = { dueMs: frDue, state: clockState(frDue, args.firstResponseAt, now) };
  const resolve = { dueMs: reDue, state: clockState(reDue, args.resolvedAt, now) };
  return {
    firstResponse,
    resolve,
    breaching: firstResponse.state === "breached" || resolve.state === "breached",
  };
}
