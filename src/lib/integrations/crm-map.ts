// Pure CRM record → care-signal mapping (no server-only / network), so the
// field mapping stays unit-testable. The Airtable fetching lives in crm-seam.ts.

export type CrmDeal = { name: string; stage: string; mrr: number | null; expectedClose: string | null };

export type CrmCareSignal = {
  companyName: string;
  lifecycleStage: string | null;
  healthFlag: "green" | "amber" | "red" | null;
  careCadence: string | null;
  lastMeaningfulContact: string | null;
  nextCareTouch: { type: string | null; dueDate: string | null } | null;
  openDeals: CrmDeal[];
  mrr: number | null;
  renewalDate: string | null;
  watchlist: boolean;
  nextBestAction: string | null;
  /** How the requester was tied to this CRM company. */
  matchedBy: "email" | "name";
};

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Build a CrmCareSignal from a Company record's fields plus its open deals and
 *  next care touch. Unknown/absent Account Health maps to a null flag. */
export function mapCompanyToCareSignal(
  fields: Record<string, unknown>,
  extra: { openDeals: CrmDeal[]; nextCareTouch: CrmCareSignal["nextCareTouch"]; matchedBy: "email" | "name" },
): CrmCareSignal {
  const health = str(fields["Account Health"]).toLowerCase();
  return {
    companyName: str(fields["Name"]),
    lifecycleStage: str(fields["Lifecycle Stage"]) || null,
    healthFlag: health === "green" || health === "amber" || health === "red" ? health : null,
    careCadence: str(fields["Care Cadence"]) || null,
    lastMeaningfulContact: str(fields["Last Meaningful Contact"]) || null,
    nextCareTouch: extra.nextCareTouch,
    openDeals: extra.openDeals,
    mrr: num(fields["MRR"]),
    renewalDate: str(fields["Renewal Date"]) || null,
    watchlist: fields["Watchlist"] === true,
    nextBestAction: str(fields["Next Best Action"]) || null,
    matchedBy: extra.matchedBy,
  };
}
