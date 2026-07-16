import { describe, expect, it } from "vitest";
import { mapCompanyToCareSignal, type CrmDeal } from "./crm-map";

describe("mapCompanyToCareSignal", () => {
  const deals: CrmDeal[] = [{ name: "Upsell — Pricing widget", stage: "Proposal", mrr: 90, expectedClose: "2026-08-01" }];
  const touch = { type: "Quarterly review", dueDate: "2026-07-30" };

  it("maps a full Company record to a care signal", () => {
    const signal = mapCompanyToCareSignal(
      {
        Name: "Sunny Heart Travel",
        "Account Health": "Amber",
        "Care Cadence": "Quarterly",
        "Lifecycle Stage": "Customer",
        "Last Meaningful Contact": "2026-06-20",
        MRR: 250,
        "Renewal Date": "2026-12-01",
        Watchlist: true,
        "Next Best Action": "Book the Q3 review",
      },
      { openDeals: deals, nextCareTouch: touch, matchedBy: "email" },
    );
    expect(signal.companyName).toBe("Sunny Heart Travel");
    expect(signal.healthFlag).toBe("amber");
    expect(signal.careCadence).toBe("Quarterly");
    expect(signal.lifecycleStage).toBe("Customer");
    expect(signal.mrr).toBe(250);
    expect(signal.watchlist).toBe(true);
    expect(signal.nextBestAction).toBe("Book the Q3 review");
    expect(signal.openDeals).toHaveLength(1);
    expect(signal.nextCareTouch).toEqual(touch);
    expect(signal.matchedBy).toBe("email");
  });

  it("normalises the health flag and tolerates an unknown/absent value", () => {
    expect(mapCompanyToCareSignal({ "Account Health": "Green" }, { openDeals: [], nextCareTouch: null, matchedBy: "name" }).healthFlag).toBe("green");
    expect(mapCompanyToCareSignal({ "Account Health": "Unknown" }, { openDeals: [], nextCareTouch: null, matchedBy: "name" }).healthFlag).toBeNull();
    expect(mapCompanyToCareSignal({}, { openDeals: [], nextCareTouch: null, matchedBy: "name" }).healthFlag).toBeNull();
  });

  it("returns null for absent optional fields rather than empty strings", () => {
    const s = mapCompanyToCareSignal({ Name: "FlyJoy" }, { openDeals: [], nextCareTouch: null, matchedBy: "name" });
    expect(s.careCadence).toBeNull();
    expect(s.lastMeaningfulContact).toBeNull();
    expect(s.mrr).toBeNull();
    expect(s.renewalDate).toBeNull();
    expect(s.nextBestAction).toBeNull();
    expect(s.watchlist).toBe(false);
  });
});
