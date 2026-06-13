import { describe, expect, it } from "vitest";
import { addBusinessMinutes, clockState, dueAt, DEFAULT_CALENDAR } from "./sla";

const ms = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo, d, h, mi);

describe("addBusinessMinutes (Europe/London)", () => {
  it("adds within a single working day (GMT)", () => {
    // Mon 2026-01-05 09:00 London (GMT) + 4h → 13:00
    expect(addBusinessMinutes(ms(2026, 0, 5, 9), 240)).toBe(ms(2026, 0, 5, 13));
  });

  it("spills across the weekend", () => {
    // Fri 2026-01-09 16:00 + 4h → 1h Fri + 3h Mon → Mon 2026-01-12 12:00
    expect(addBusinessMinutes(ms(2026, 0, 9, 16), 240)).toBe(ms(2026, 0, 12, 12));
  });

  it("starts from the next window when opened out of hours", () => {
    // Sat 2026-01-10 10:00 + 1h → Mon 09:00 + 1h → Mon 10:00
    expect(addBusinessMinutes(ms(2026, 0, 10, 10), 60)).toBe(ms(2026, 0, 12, 10));
  });

  it("handles BST (summer offset)", () => {
    // Mon 2026-06-08 09:00 BST (= 08:00 UTC) + 4h → 13:00 BST (= 12:00 UTC)
    expect(addBusinessMinutes(ms(2026, 5, 8, 8), 240)).toBe(ms(2026, 5, 8, 12));
  });
});

describe("dueAt", () => {
  it("uses calendar time when business_hours is false", () => {
    const start = "2026-01-09T16:00:00Z";
    expect(dueAt(start, 240, false)).toBe(ms(2026, 0, 9, 20));
  });

  it("uses business time when business_hours is true", () => {
    expect(dueAt("2026-01-09T16:00:00Z", 240, true, DEFAULT_CALENDAR)).toBe(ms(2026, 0, 12, 12));
  });
});

describe("clockState", () => {
  const due = ms(2026, 0, 5, 13);
  it("is pending before the deadline when unmet", () => {
    expect(clockState(due, null, ms(2026, 0, 5, 12))).toBe("pending");
  });
  it("is breached after the deadline when unmet", () => {
    expect(clockState(due, null, ms(2026, 0, 5, 14))).toBe("breached");
  });
  it("is met when satisfied before the deadline", () => {
    expect(clockState(due, "2026-01-05T12:30:00Z", ms(2026, 0, 5, 14))).toBe("met");
  });
  it("is late when satisfied after the deadline", () => {
    expect(clockState(due, "2026-01-05T13:30:00Z", ms(2026, 0, 5, 14))).toBe("late");
  });
});
