import { describe, expect, it } from "vitest";
import { summariseClientSupport, type CrmSupportTicket } from "./crm-support";

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const DAY = 86_400_000;

function t(p: Partial<CrmSupportTicket> & { createdMs: number }): CrmSupportTicket {
  return { status: p.status ?? "resolved", createdMs: p.createdMs, subject: p.subject ?? "An issue", csat: p.csat ?? null };
}

describe("summariseClientSupport", () => {
  it("counts open tickets, 30-day volume, and the latest issue/contact", () => {
    const tickets = [
      t({ createdMs: NOW - 2 * DAY, status: "escalated", subject: "Deposit failing" }), // open + recent + latest
      t({ createdMs: NOW - 10 * DAY, status: "resolved", subject: "Login help" }),
      t({ createdMs: NOW - 45 * DAY, status: "closed", subject: "Old thing" }), // outside 30d, not open
    ];
    const s = summariseClientSupport(tickets, NOW);
    expect(s.openTickets).toBe(1); // only the escalated one is open
    expect(s.tickets30d).toBe(2);
    expect(s.lastIssue).toBe("Deposit failing");
    expect(s.lastContact).toBe("2026-07-14");
  });

  it("flags declining sentiment on repeated negative CSAT", () => {
    const tickets = [
      t({ createdMs: NOW - 1 * DAY, csat: 1 }),
      t({ createdMs: NOW - 3 * DAY, csat: 2 }),
      t({ createdMs: NOW - 5 * DAY, csat: 5 }),
    ];
    expect(summariseClientSupport(tickets, NOW).sentiment).toBe("Declining");
  });

  it("flags improving sentiment on repeated positive CSAT", () => {
    const tickets = [t({ createdMs: NOW - 1 * DAY, csat: 5 }), t({ createdMs: NOW - 2 * DAY, csat: 4 })];
    expect(summariseClientSupport(tickets, NOW).sentiment).toBe("Improving");
  });

  it("is stable with tickets but no clear signal, and null with no tickets", () => {
    expect(summariseClientSupport([t({ createdMs: NOW - 1 * DAY })], NOW).sentiment).toBe("Stable");
    const empty = summariseClientSupport([], NOW);
    expect(empty).toEqual({ openTickets: 0, tickets30d: 0, lastIssue: null, lastContact: null, sentiment: null });
  });
});
