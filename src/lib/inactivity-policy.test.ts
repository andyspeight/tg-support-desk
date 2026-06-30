import { describe, expect, it } from "vitest";
import { decideInactivityAction } from "./inactivity-policy";

// Anchor on a known Friday 16:00 Europe/London (BST = UTC+1 in June).
const friAfternoon = Date.UTC(2026, 5, 26, 15, 0, 0); // Fri 26 Jun, 16:00 BST

describe("decideInactivityAction", () => {
  it("does nothing once the customer has replied", () => {
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon,
        lastMessageFromCustomer: true,
        reminderMs: null,
        nowMs: friAfternoon + 30 * 24 * 3600_000,
        remindDays: 3,
        closeDays: 7,
      }),
    ).toBe("none");
  });

  it("does not remind before the threshold", () => {
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon,
        lastMessageFromCustomer: false,
        reminderMs: null,
        nowMs: friAfternoon + 30 * 60_000, // 30 min later
        remindDays: 1,
        closeDays: 7,
      }),
    ).toBe("none");
  });

  it("does not count the weekend toward the threshold", () => {
    // Saturday: only 1 business hour has actually elapsed since Fri 16:00.
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon,
        lastMessageFromCustomer: false,
        reminderMs: null,
        nowMs: Date.UTC(2026, 5, 27, 15, 0, 0), // Sat 16:00 BST
        remindDays: 1,
        closeDays: 7,
      }),
    ).toBe("none");
  });

  it("reminds once a full business day of silence has passed", () => {
    // Monday 16:30 BST — 1 business day (Fri 16–17 + Mon 9–16) has elapsed.
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon,
        lastMessageFromCustomer: false,
        reminderMs: null,
        nowMs: Date.UTC(2026, 5, 29, 15, 30, 0), // Mon 16:30 BST
        remindDays: 1,
        closeDays: 7,
      }),
    ).toBe("remind");
  });

  it("waits for the post-reminder grace before closing", () => {
    const reminderMs = friAfternoon;
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon - 5 * 24 * 3600_000,
        lastMessageFromCustomer: false,
        reminderMs,
        nowMs: reminderMs + 60 * 60_000, // 1h after the reminder
        remindDays: 3,
        closeDays: 7,
      }),
    ).toBe("none");
  });

  it("closes once the post-reminder grace has elapsed", () => {
    const reminderMs = friAfternoon;
    expect(
      decideInactivityAction({
        lastCustomerMs: friAfternoon - 5 * 24 * 3600_000,
        lastMessageFromCustomer: false,
        reminderMs,
        nowMs: reminderMs + 30 * 24 * 3600_000, // well past any grace
        remindDays: 3,
        closeDays: 7,
      }),
    ).toBe("close");
  });
});
