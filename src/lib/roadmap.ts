// The visual roadmap rendered on /dashboard. Single source of truth for
// build progress — update statuses here as items ship (full detail and exit
// criteria live in docs/DEVELOPMENT-PLAN.md).

export type RoadmapItemStatus = "done" | "in_progress" | "blocked" | "todo";

export type RoadmapItem = {
  label: string;
  status: RoadmapItemStatus;
  note?: string;
};

export type RoadmapStage = {
  id: number;
  name: string;
  target: string;
  items: RoadmapItem[];
};

export const RESOLUTION_MILESTONES = [
  { pct: 50, label: "day 60 — KB" },
  { pct: 65, label: "diagnostics" },
  { pct: 70, label: "actions + loop" },
] as const;

export const ROADMAP: RoadmapStage[] = [
  {
    id: 0,
    name: "Foundations",
    target: "Platform built and deployed",
    items: [
      { label: "Supabase schema + RLS + pgvector", status: "done" },
      { label: "AI resolution loop (3 tools, guardrails, handovers)", status: "done" },
      { label: "Gmail email channel (threading, sanitisation, verification)", status: "done" },
      { label: "Inbox, ticket view, KB review queue UI", status: "done" },
      { label: "Eval harness + unit tests", status: "done" },
      { label: "Vercel production deploy", status: "done" },
      { label: "KB seeded — 171 Knowledge Bot articles", status: "done" },
    ],
  },
  {
    id: 1,
    name: "Light the fire",
    target: "Go live — parallel run starts",
    items: [
      { label: "Env credentials into Vercel", status: "blocked", note: "Andy: keys" },
      { label: ".travelify.io subdomain (SSO cookie scope)", status: "blocked", note: "Andy: DNS" },
      { label: "Gmail round-trip smoke test", status: "todo", note: "needs creds" },
      { label: "Seeded KB curated + published", status: "done" },
      { label: "~10 hand-written top-intent how-tos", status: "in_progress", note: "drafted; 5 need facts" },
      { label: "Eval set to 10 real cases, suite green", status: "in_progress", note: "4 of 10" },
      { label: "Security checklist pass (brief §10)", status: "in_progress", note: "headers + rate limits in" },
      { label: "Agent seats + 30-min onboarding", status: "blocked", note: "names needed" },
      { label: "Parallel-run protocol defined", status: "done" },
    ],
  },
  {
    id: 2,
    name: "Helpdesk parity",
    target: "No feature loss vs Zendesk",
    items: [
      { label: "Auto-reply / bounce / loop guard", status: "done" },
      { label: "CC + multi-recipient handling", status: "done" },
      { label: "AI triage auto-tagging (intent / priority / language)", status: "done" },
      { label: "Global search", status: "done" },
      { label: "Merge tickets", status: "done" },
      { label: "Bulk actions + keyboard triage", status: "done" },
      { label: "Canned-response + tag management UI", status: "done" },
      { label: "Attachments (allowlist, caps, signed URLs)", status: "done" },
      { label: "Spam controls", status: "done" },
      { label: "Agent notifications (in-app + email mirror)", status: "done" },
      { label: "Collision detection + realtime inbox", status: "todo", note: "needs SSO JWT" },
      { label: "Ops runbook (alerting needs a live channel)", status: "in_progress" },
    ],
  },
  {
    id: 3,
    name: "Channels, 360 & measurement",
    target: "Widget live · CSAT ≥4.5 · analytics trusted",
    items: [
      { label: "CSAT one-tap surveys (gates the headline metric)", status: "done" },
      { label: "Analytics v1 — true resolution rate, intent, SLA, Pareto", status: "done" },
      { label: "SLA engine + business hours + breach view", status: "done" },
      { label: "Client support portal (SSO — self-serve KB, tickets, CSAT)", status: "done" },
      { label: "Customer 360 panel (Airtable + CRM + Luna + history)", status: "in_progress", note: "Airtable + history live; seams stubbed" },
      { label: "In-dashboard widget channel (SSO, widget-core fork)", status: "todo" },
      { label: "Agent copilot (draft / rephrase / summarise / translate)", status: "done" },
    ],
  },
  {
    id: 4,
    name: "The 70% engine",
    target: "≥65% true resolution rolling 30d",
    items: [
      { label: "Self-improvement loop + weekly gap digest", status: "done" },
      { label: "Supplier error feed API → get_integration_errors", status: "blocked", note: "Andy: error feed" },
      { label: "validate_deeplink against official spec", status: "blocked", note: "Andy: spec" },
      { label: "check_endpoint_health", status: "todo" },
      { label: "Gated corrective actions + verify-after + audit", status: "todo" },
      { label: "Procedure runbooks — top 10 travel intents", status: "todo" },
      { label: "Eval ≥50 cases + CI gate", status: "todo" },
      { label: "Public KB portal with AI deflection", status: "todo", note: "SSO portal shipped" },
    ],
  },
  {
    id: 5,
    name: "Scale & cancel Zendesk",
    target: "70%+ sustained · Zendesk cancelled",
    items: [
      { label: "WhatsApp channel (360dialog)", status: "todo" },
      { label: "CRM two-way — churn early-warning signals", status: "todo" },
      { label: "Multi-tenant settings surface", status: "todo" },
      { label: "GDPR export / delete tooling", status: "todo" },
      { label: "Performance + cost pass (caching, model mix, rate limits)", status: "todo" },
      { label: "Zendesk cancellation gate (4wks · 200 tickets · ≥50% · sign-off)", status: "todo" },
    ],
  },
];

export function stageStatus(stage: RoadmapStage): RoadmapItemStatus {
  if (stage.items.every((i) => i.status === "done")) return "done";
  if (stage.items.some((i) => i.status !== "todo")) return "in_progress";
  return "todo";
}
