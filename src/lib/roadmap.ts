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
      { label: "Env credentials into Vercel", status: "done" },
      { label: "SSO live — desk on help.travelgenix.io (cross-domain bridge)", status: "done" },
      { label: "Gmail live — inbound + outbound round-trip verified", status: "done" },
      { label: "Seeded KB curated + published", status: "done" },
      { label: "Top-intent KB coverage published", status: "done", note: "University how-tos + pricing-rules guides live & embedded" },
      { label: "Eval set to 10 real cases, suite green", status: "in_progress", note: "4 of 10 — deepening, not a parallel-run blocker" },
      { label: "Security checklist + auth review passed (brief §10)", status: "done" },
      { label: "Agent seats live (SSO login working)", status: "done" },
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
      { label: "Global search — ranked, highlighted + semantic", status: "done" },
      { label: "Merge tickets", status: "done" },
      { label: "Bulk actions + keyboard triage", status: "done" },
      { label: "Canned-response + tag management UI", status: "done" },
      { label: "Attachments (allowlist, caps, signed URLs)", status: "done" },
      { label: "Spam controls", status: "done" },
      { label: "Agent notifications (in-app + email mirror)", status: "done" },
      { label: "Branded reply emails + instant auto-acknowledgement", status: "done" },
      { label: "Fully mobile-responsive agent app", status: "done" },
      { label: "Collision detection + realtime inbox", status: "in_progress", note: "collision live; realtime inbox awaits SSO JWT (polls for now)" },
      { label: "Ops runbook + agent alerting", status: "done", note: "runbook live; email alerting to agents live" },
    ],
  },
  {
    id: 3,
    name: "Channels, 360 & measurement",
    target: "Widget live · CSAT ≥4.5 · analytics trusted",
    items: [
      { label: "CSAT one-tap surveys (gates the headline metric)", status: "done", note: "portal + signed survey live; email prompt removed by request" },
      { label: "Analytics v1 — true resolution rate, intent, SLA, Pareto", status: "done" },
      { label: "SLA engine + business hours + breach view", status: "done" },
      { label: "Client support portal (SSO — self-serve KB, tickets, CSAT)", status: "done" },
      { label: "Customer 360 panel (Airtable + CRM + Luna + history)", status: "in_progress", note: "Airtable + history live; seams stubbed" },
      { label: "In-dashboard widget channel (SSO, widget-core fork)", status: "todo" },
      { label: "Agent copilot (draft / rephrase / summarise / translate)", status: "done" },
      { label: "KB referencing in replies + public article pages", status: "done" },
    ],
  },
  {
    id: 4,
    name: "The 70% engine",
    target: "≥65% true resolution rolling 30d",
    items: [
      { label: "Self-improvement loop + weekly gap digest", status: "done" },
      { label: "Graduated autonomy + AI QA guardrail judge", status: "done", note: "auto-send safe answers; every AI reply independently graded" },
      { label: "Proactive supplier-outage outreach", status: "done", note: "manual now; auto-populates when the error feed lands" },
      { label: "Supplier error feed API → get_integration_errors", status: "blocked", note: "Andy: error feed" },
      { label: "validate_deeplink against official spec", status: "blocked", note: "Andy: spec" },
      { label: "check_endpoint_health", status: "todo" },
      { label: "Gated corrective actions + verify-after + audit", status: "todo" },
      { label: "Procedure runbooks — top 10 travel intents", status: "todo" },
      { label: "Eval ≥50 cases + CI gate", status: "todo" },
      { label: "Public KB portal with AI deflection", status: "in_progress", note: "public article pages + submit AI deflection live; searchable index to build" },
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
      { label: "GDPR export / delete tooling", status: "done" },
      { label: "Performance + cost pass (caching, model mix, rate limits)", status: "in_progress", note: "model mix + rate limits in; prompt caching outstanding" },
      { label: "Zendesk cancellation gate (4wks · 200 tickets · ≥50% · sign-off)", status: "todo" },
    ],
  },
];

export function stageStatus(stage: RoadmapStage): RoadmapItemStatus {
  if (stage.items.every((i) => i.status === "done")) return "done";
  if (stage.items.some((i) => i.status !== "todo")) return "in_progress";
  return "todo";
}
