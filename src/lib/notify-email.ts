// Pure builder for the agent notification digest email. Each alert gets a direct
// link to its ticket plus the ticket's key details, so it's actionable straight
// from the inbox instead of a bare "open the desk" link. Pure + unit-tested.

export type NotifyTicket = {
  reference: number;
  subject: string;
  requesterName: string | null;
  requesterEmail: string;
  company: string | null;
  status: string;
  priority: string;
  url: string;
};

export type NotifyEmailItem = {
  /** Human label for the notification type, e.g. "AI reply ready to send". */
  label: string;
  title: string;
  body: string | null;
  /** The ticket this alert is about, resolved — or null when it isn't ticket-scoped. */
  ticket: NotifyTicket | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  ai_working: "AI working",
  waiting_on_customer: "Waiting on customer",
  needs_review: "Needs review",
  escalated: "Escalated",
  pending: "Pending",
  awaiting_approval: "Pending approval",
  resolved: "Resolved",
  closed: "Closed",
};
const PRIORITY_LABEL: Record<string, string> = { p1: "P1 — Urgent", p2: "P2 — Standard", p3: "P3 — Low" };

const statusText = (s: string) => STATUS_LABEL[s] ?? s;
const priorityText = (p: string) => PRIORITY_LABEL[p] ?? p;
const fromText = (t: NotifyTicket) =>
  `${t.requesterName ? `${t.requesterName} <${t.requesterEmail}>` : t.requesterEmail}${t.company ? ` · ${t.company}` : ""}`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderNotificationDigest(
  items: NotifyEmailItem[],
  opts: { notificationsUrl: string },
): { text: string; html: string } {
  const n = items.length;
  const heading = `You have ${n} new support desk notification${n === 1 ? "" : "s"}.`;

  // ── plain text ──────────────────────────────────────────────────────────
  const textBlocks = items.map((it) => {
    const lines = [`• ${it.label}: ${it.title}`];
    if (it.ticket) {
      const t = it.ticket;
      lines.push(`    Ticket:  #${t.reference} — ${t.subject}`);
      lines.push(`    From:    ${fromText(t)}`);
      lines.push(`    Status:  ${statusText(t.status)} · ${priorityText(t.priority)}`);
      if (it.body) lines.push(`    Note:    ${it.body}`);
      lines.push(`    Open:    ${t.url}`);
    } else if (it.body) {
      lines.push(`    ${it.body}`);
    }
    return lines.join("\n");
  });
  const text = [heading, "", textBlocks.join("\n\n"), "", `All notifications: ${opts.notificationsUrl}`].join("\n");

  // ── html ────────────────────────────────────────────────────────────────
  const cards = items
    .map((it) => {
      const t = it.ticket;
      const row = (k: string, v: string) =>
        `<tr><td style="padding:2px 10px 2px 0;color:#8a8f98;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:2px 0;color:#1f2937;">${v}</td></tr>`;
      const details = t
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:13px;line-height:1.5;">
             ${row("Ticket", `#${t.reference} — ${esc(t.subject)}`)}
             ${row("From", esc(fromText(t)))}
             ${row("Status", `${esc(statusText(t.status))} &middot; ${esc(priorityText(t.priority))}`)}
             ${it.body ? row("Note", esc(it.body)) : ""}
           </table>
           <a href="${esc(t.url)}" style="display:inline-block;margin-top:12px;background:#1b2b5b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 14px;border-radius:6px;">Open ticket #${t.reference} &rarr;</a>`
        : it.body
          ? `<p style="margin:8px 0 0;font-size:13px;color:#52525b;">${esc(it.body)}</p>`
          : "";
      return `<div style="border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin:0 0 12px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#00849e;">${esc(it.label)}</div>
          <div style="margin-top:3px;font-size:15px;font-weight:600;color:#111827;">${esc(it.title)}</div>
          ${details}
        </div>`;
    })
    .join("");

  const html = `<div style="font-family:${FONT};background:#f4f5f7;padding:24px 12px;">
      <div style="max-width:600px;margin:0 auto;">
        <p style="font-size:15px;font-weight:600;color:#1f2937;margin:0 0 14px;">${esc(heading)}</p>
        ${cards}
        <p style="font-size:12px;color:#8a8f98;margin:8px 2px 0;">
          <a href="${esc(opts.notificationsUrl)}" style="color:#00849e;">See all notifications</a>
        </p>
      </div>
    </div>`;

  return { text, html };
}
