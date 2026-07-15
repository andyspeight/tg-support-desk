import { describe, expect, it } from "vitest";
import { computeClientsToWatch, computeRepeatContacts, groundClusters, slugify, type InsightTicket } from "./aggregate";
import type { RawTheme } from "@/lib/ai/cluster-tickets";

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);
const DAY = 86_400_000;

function ticket(p: Partial<InsightTicket> & { reference: number }): InsightTicket {
  return {
    id: `id-${p.reference}`,
    reference: p.reference,
    subject: p.subject ?? `Subject ${p.reference}`,
    intent: p.intent ?? null,
    status: p.status ?? "new",
    createdMs: p.createdMs ?? NOW - DAY,
    clientId: p.clientId ?? null,
    email: p.email ?? `user${p.reference}@example.com`,
    name: p.name ?? null,
    csat: p.csat ?? null,
    escalated: p.escalated ?? false,
  };
}

const NO_NAMES = new Map<string, string>();

describe("groundClusters", () => {
  const trending = [ticket({ reference: 10 }), ticket({ reference: 11 }), ticket({ reference: 12 }), ticket({ reference: 13 })];

  it("keeps only real references and enforces the 3+ threshold", () => {
    const themes: RawTheme[] = [
      { label: "Customers can't log in", description: "Login failing", references: [10, 11, 12, 999] }, // 999 is fake
      { label: "Minor thing", description: "one-off", references: [13] }, // below threshold
    ];
    const clusters = groundClusters(themes, trending, NO_NAMES, new Map(), new Date(NOW).toISOString(), 3);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe("Customers can't log in");
    expect(clusters[0].count).toBe(3); // fake 999 dropped
    expect(clusters[0].tickets.map((t) => t.reference)).toEqual([10, 11, 12]);
  });

  it("dedupes repeated references so the count can't be inflated", () => {
    const themes: RawTheme[] = [{ label: "Dupes", description: "", references: [10, 10, 11, 11, 12] }];
    const clusters = groundClusters(themes, trending, NO_NAMES, new Map(), new Date(NOW).toISOString(), 3);
    expect(clusters[0].count).toBe(3);
  });

  it("marks a theme emerging unless it was in the prior snapshot", () => {
    const themes: RawTheme[] = [{ label: "No search results", description: "", references: [10, 11, 12] }];
    const key = slugify("No search results");
    const fresh = groundClusters(themes, trending, NO_NAMES, new Map(), new Date(NOW).toISOString(), 3);
    expect(fresh[0].emerging).toBe(true);

    const priorSeenIso = new Date(NOW - 2 * DAY).toISOString();
    const seen = groundClusters(themes, trending, NO_NAMES, new Map([[key, priorSeenIso]]), new Date(NOW).toISOString(), 3);
    expect(seen[0].emerging).toBe(false);
    expect(seen[0].firstSeen).toBe(priorSeenIso); // carried forward
  });

  it("attaches the client name when known", () => {
    const withClient = [
      ticket({ reference: 1, clientId: "recAAAAAAAAAAAAAA" }),
      ticket({ reference: 2, clientId: "recAAAAAAAAAAAAAA" }),
      ticket({ reference: 3, clientId: "recAAAAAAAAAAAAAA" }),
    ];
    const themes: RawTheme[] = [{ label: "X", description: "", references: [1, 2, 3] }];
    const names = new Map([["recAAAAAAAAAAAAAA", "Acme Travel"]]);
    const clusters = groundClusters(themes, withClient, names, new Map(), new Date(NOW).toISOString(), 3);
    expect(clusters[0].tickets[0].clientName).toBe("Acme Travel");
  });
});

describe("computeClientsToWatch", () => {
  it("flags rising volume, escalations, negative CSAT and reopens", () => {
    const c = "recCLIENT00000001";
    const last30: InsightTicket[] = [
      ticket({ reference: 1, clientId: c, escalated: true }),
      ticket({ reference: 2, clientId: c, escalated: true }),
      ticket({ reference: 3, clientId: c, csat: 1 }),
      ticket({ reference: 4, clientId: c }),
    ];
    const prev30: InsightTicket[] = [ticket({ reference: 90, clientId: c })]; // 1 prior → 4 now = +300%
    const reopens = new Map([[c, 2]]);
    const [row] = computeClientsToWatch(last30, prev30, reopens, new Map([[c, "Acme"]]));
    expect(row.clientName).toBe("Acme");
    expect(row.count30).toBe(4);
    expect(row.deltaPct).toBe(300);
    expect(row.flags).toEqual(expect.arrayContaining(["rising", "escalations", "negative-csat", "reopens"]));
  });

  it("drops quiet clients with no flags and no real volume", () => {
    const rows = computeClientsToWatch([ticket({ reference: 1, clientId: "recQ0000000000001" })], [], new Map(), NO_NAMES);
    expect(rows).toHaveLength(0); // count30 = 1, no flags
  });
});

describe("computeRepeatContacts", () => {
  it("flags a requester with 3+ tickets in the window, case-insensitively", () => {
    const w: InsightTicket[] = [
      ticket({ reference: 1, email: "Sam@acme.com", name: "Sam" }),
      ticket({ reference: 2, email: "sam@acme.com" }),
      ticket({ reference: 3, email: "SAM@acme.com" }),
      ticket({ reference: 4, email: "other@acme.com" }),
    ];
    const repeats = computeRepeatContacts(w, NO_NAMES, 3);
    expect(repeats).toHaveLength(1);
    expect(repeats[0].email).toBe("sam@acme.com");
    expect(repeats[0].count).toBe(3);
    expect(repeats[0].name).toBe("Sam");
  });
});
