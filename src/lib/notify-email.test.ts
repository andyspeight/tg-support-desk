import { describe, it, expect } from "vitest";
import { renderNotificationDigest, type NotifyEmailItem } from "./notify-email";

const ticketItem: NotifyEmailItem = {
  label: "AI reply ready to send",
  title: "QA flag on #8053 — check the AI's reply",
  body: "Good structure and warm tone, but the exact UI steps aren't in the KB.",
  ticket: {
    reference: 8053,
    subject: "Where do I add my header code?",
    requesterName: "Jane Doe",
    requesterEmail: "jane@acme.com",
    company: "Acme Travel",
    status: "needs_review",
    priority: "p2",
    url: "https://help.travelgenix.io/staff/ticket/abc-123",
  },
};

describe("renderNotificationDigest", () => {
  it("includes a direct ticket link and the ticket details (text + html)", () => {
    const { text, html } = renderNotificationDigest([ticketItem], {
      notificationsUrl: "https://help.travelgenix.io/staff/notifications",
    });
    // Direct link to the ticket, not the generic notifications page.
    expect(text).toContain("https://help.travelgenix.io/staff/ticket/abc-123");
    expect(html).toContain('href="https://help.travelgenix.io/staff/ticket/abc-123"');
    // Ticket details are present.
    expect(text).toContain("#8053 — Where do I add my header code?");
    expect(text).toContain("Jane Doe <jane@acme.com> · Acme Travel");
    expect(text).toContain("Needs review · P2 — Standard");
    expect(html).toContain("Acme Travel");
    expect(html).toContain("Open ticket #8053");
  });

  it("pluralises and lists multiple notifications", () => {
    const { text } = renderNotificationDigest([ticketItem, ticketItem], {
      notificationsUrl: "https://x/staff/notifications",
    });
    expect(text).toContain("You have 2 new support desk notifications.");
  });

  it("falls back gracefully when a notification has no ticket", () => {
    const { text, html } = renderNotificationDigest(
      [{ label: "Senders awaiting approval", title: "3 senders need approval", body: null, ticket: null }],
      { notificationsUrl: "https://x/staff/notifications" },
    );
    expect(text).toContain("• Senders awaiting approval: 3 senders need approval");
    expect(html).toContain("3 senders need approval");
  });

  it("escapes HTML in untrusted fields", () => {
    const { html } = renderNotificationDigest(
      [{ ...ticketItem, title: "<script>alert(1)</script>", ticket: { ...ticketItem.ticket!, subject: "<b>x</b>" } }],
      { notificationsUrl: "https://x" },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
