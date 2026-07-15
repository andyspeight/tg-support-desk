// Shapes for the computed insights snapshot (stored in trend_snapshots.payload).
// Pure types — no imports, so both the DB layer and the compute layer can share
// them without a cycle.

export type TrendTicketRef = {
  id: string;
  reference: number;
  subject: string;
  clientName: string | null;
};

/** A recurring problem theme across recent tickets (3+ to surface). */
export type TrendCluster = {
  /** Stable slug for the theme, used to carry firstSeen across runs + dedupe. */
  key: string;
  label: string; // human sentence, e.g. "Customers can't log in"
  description: string; // one sentence on the shared problem
  count: number; // === tickets.length, always >= the threshold
  tickets: TrendTicketRef[];
  firstSeen: string; // ISO — when this theme was first detected
  emerging: boolean; // not present in the previous snapshot
};

/** Per-client health over the last 30 days vs the prior 30. */
export type ClientWatch = {
  clientId: string;
  clientName: string | null;
  count30: number;
  countPrev30: number;
  deltaPct: number | null; // null when there's no prior-period baseline
  escalations: number;
  reopens: number;
  csatAvg: number | null;
  negativeCsat: number;
  flags: string[]; // e.g. ["rising", "escalations", "negative-csat"]
};

/** The same person opening several tickets in a short window (frustration). */
export type RepeatContact = {
  email: string;
  name: string | null;
  clientName: string | null;
  count: number;
  tickets: TrendTicketRef[];
};

/** A negative-experience spike — reopens and/or negative CSAT rising. */
export type NegativeSpike = {
  scope: "overall" | "client";
  clientId: string | null;
  clientName: string | null;
  reopens: number;
  negativeCsat: number;
  windowDays: number;
};

/** A trending cluster whose clients line up with a live supplier incident. */
export type SupplierCorrelation = {
  clusterKey: string;
  clusterLabel: string;
  supplier: string;
  summary: string;
  detectedAt: string | null;
  overlapCount: number;
};

export type InsightsSnapshot = {
  version: 1;
  computedAt: string;
  windowDays: number;
  ticketsAnalysed: number;
  clusters: TrendCluster[];
  clientsToWatch: ClientWatch[];
  repeatContacts: RepeatContact[];
  negativeSpikes: NegativeSpike[];
  supplierCorrelations: SupplierCorrelation[];
  /** True once the detector has run against real data (vs the empty default). */
  computed: boolean;
};

export const EMPTY_SNAPSHOT: InsightsSnapshot = {
  version: 1,
  computedAt: new Date(0).toISOString(),
  windowDays: 5,
  ticketsAnalysed: 0,
  clusters: [],
  clientsToWatch: [],
  repeatContacts: [],
  negativeSpikes: [],
  supplierCorrelations: [],
  computed: false,
};
