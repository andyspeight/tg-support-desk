import { describe, expect, it } from "vitest";
import {
  allowPatternFor,
  detectAutoReply,
  FREE_MAIL_DOMAINS,
  matchesBlocklist,
  normaliseCid,
  normaliseSubject,
  parseAddress,
  parseAddressList,
  parseGmailMessage,
  sanitizeEmailHtml,
  stripQuotedReply,
  type GmailMessage,
} from "./email-parse";

describe("stripQuotedReply", () => {
  it("cuts Gmail-style quoted history", () => {
    const text = "Thanks, that fixed it!\n\nOn Tue, 10 Jun 2026 at 14:02, Travelgenix Support <support@travelify.io> wrote:\n> Hi Sarah,\n> Try re-entering the credentials.";
    expect(stripQuotedReply(text)).toBe("Thanks, that fixed it!");
  });

  it("cuts Outlook-style original message blocks", () => {
    const text = "Still broken I'm afraid.\n\n-----Original Message-----\nFrom: support@travelify.io\nSent: Tuesday";
    expect(stripQuotedReply(text)).toBe("Still broken I'm afraid.");
  });

  it("drops trailing signatures after the -- delimiter", () => {
    const text = "Can you check our widget?\n\n-- \nTom Baker\nBaker Holidays";
    expect(stripQuotedReply(text)).toBe("Can you check our widget?");
  });

  it("keeps the original when stripping would remove everything", () => {
    const text = "On the booking page the widget never loads.";
    expect(stripQuotedReply(text)).toBe(text);
  });
});

describe("parseAddress", () => {
  it("parses display-name addresses", () => {
    expect(parseAddress('"Sarah Mills" <sarah@sunshine.example.com>')).toEqual({
      name: "Sarah Mills",
      email: "sarah@sunshine.example.com",
    });
  });

  it("parses bare addresses", () => {
    expect(parseAddress("tom@baker.example.com")).toEqual({ name: null, email: "tom@baker.example.com" });
  });
});

describe("parseAddressList", () => {
  it("parses a mixed Cc header into unique lowercased emails", () => {
    expect(
      parseAddressList('"Booking Team" <team@sunshine.example.com>, ops@sunshine.example.com, team@sunshine.example.com'),
    ).toEqual(["team@sunshine.example.com", "ops@sunshine.example.com"]);
  });

  it("returns empty for a null header", () => {
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe("matchesBlocklist", () => {
  const patterns = ["spammer@bad.example.com", "@junk.example.com"];

  it("matches exact addresses case-insensitively", () => {
    expect(matchesBlocklist("Spammer@Bad.Example.com", patterns)).toBe(true);
    expect(matchesBlocklist("someone@bad.example.com", patterns)).toBe(false);
  });

  it("matches a whole domain and its subdomains", () => {
    expect(matchesBlocklist("anyone@junk.example.com", patterns)).toBe(true);
    expect(matchesBlocklist("anyone@mail.junk.example.com", patterns)).toBe(true);
    expect(matchesBlocklist("anyone@notjunk.example.com", patterns)).toBe(false);
  });

  it("does not match when blocklist is empty", () => {
    expect(matchesBlocklist("anyone@anywhere.com", [])).toBe(false);
  });
});

describe("allowPatternFor", () => {
  it("allow-lists a corporate sender by domain", () => {
    expect(allowPatternFor("jane@acme-travel.co.uk")).toBe("@acme-travel.co.uk");
    expect(allowPatternFor("Bob@Acme-Travel.CO.UK")).toBe("@acme-travel.co.uk");
  });

  it("allow-lists a free-mail sender by exact address only", () => {
    expect(allowPatternFor("someone@gmail.com")).toBe("someone@gmail.com");
    expect(allowPatternFor("Person@Outlook.com")).toBe("person@outlook.com");
    // Apple legacy + a legacy ISP domain must be treated as free-mail, not domains.
    expect(allowPatternFor("eivind2@mac.com")).toBe("eivind2@mac.com");
    expect(allowPatternFor("user@f2s.com")).toBe("user@f2s.com");
  });

  it("never returns a bare '@' for malformed input", () => {
    expect(allowPatternFor("not-an-email")).toBe("not-an-email");
    expect(allowPatternFor("")).toBe("");
  });

  it("free-mail set and matcher stay consistent — a domain rule can't trust free-mail", () => {
    for (const d of FREE_MAIL_DOMAINS) {
      const pattern = allowPatternFor(`anyone@${d}`);
      expect(pattern).not.toBe(`@${d}`); // exact address, never the whole provider
      expect(pattern).toBe(`anyone@${d}`);
    }
  });
});

describe("normaliseSubject", () => {
  it("strips reply/forward prefixes", () => {
    expect(normaliseSubject("RE: Re: Fwd: Widget broken")).toBe("widget broken");
  });
});

describe("detectAutoReply (loop guard)", () => {
  const from = "Sarah Mills <sarah@sunshine.example.com>";

  it("flags Auto-Submitted headers", () => {
    expect(detectAutoReply([{ name: "Auto-Submitted", value: "auto-replied" }], "Re: Widget", from)).toBe(true);
    expect(detectAutoReply([{ name: "Auto-Submitted", value: "no" }], "Re: Widget", from)).toBe(false);
  });

  it("flags bulk precedence and suppress headers", () => {
    expect(detectAutoReply([{ name: "Precedence", value: "bulk" }], "Newsletter", from)).toBe(true);
    expect(detectAutoReply([{ name: "X-Auto-Response-Suppress", value: "All" }], "Alert", from)).toBe(true);
  });

  it("flags daemon/no-reply senders and bounce subjects", () => {
    expect(detectAutoReply([], "Returned mail", "Mail Delivery System <mailer-daemon@googlemail.com>")).toBe(true);
    expect(detectAutoReply([], "Your booking", "no-reply@somesupplier.example.com")).toBe(true);
    expect(detectAutoReply([], "Undeliverable: Re: Widget question", from)).toBe(true);
  });

  it("flags out-of-office subjects but not normal mail", () => {
    expect(detectAutoReply([], "Automatic reply: Widget question", from)).toBe(true);
    expect(detectAutoReply([], "Out of Office — back Monday", from)).toBe(true);
    expect(detectAutoReply([], "Widget question", from)).toBe(false);
  });
});

describe("parseGmailMessage", () => {
  const encode = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

  const message: GmailMessage = {
    id: "msg1",
    threadId: "thread1",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Sarah Mills <sarah@sunshine.example.com>" },
        { name: "Subject", value: "Widget question" },
        { name: "Message-ID", value: "<abc@mail.example.com>" },
        { name: "Authentication-Results", value: "mx.google.com; spf=pass; dkim=pass" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: encode("How do we add the widget?\n"), size: 26 } },
        { mimeType: "text/html", body: { data: encode("<p>How do we add the widget?</p><script>alert(1)</script>"), size: 60 } },
      ],
    },
  };

  it("extracts sender, subject, text and verification", () => {
    const parsed = parseGmailMessage(message);
    expect(parsed.fromEmail).toBe("sarah@sunshine.example.com");
    expect(parsed.subject).toBe("Widget question");
    expect(parsed.text).toBe("How do we add the widget?");
    expect(parsed.messageId).toBe("<abc@mail.example.com>");
    expect(parsed.senderVerified).toBe("pass");
  });

  it("sanitises stored html (hostile input)", () => {
    const parsed = parseGmailMessage(message);
    expect(parsed.html).toContain("<p>");
    expect(parsed.html).not.toContain("<script>");
  });

  it("marks a body-embedded image inline and leaves a plain attachment alone", () => {
    const related: GmailMessage = {
      id: "msg2",
      threadId: "thread2",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Sarah Mills <sarah@sunshine.example.com>" },
          { name: "Subject", value: "Screenshot" },
        ],
        parts: [
          { mimeType: "text/html", body: { data: encode('<p>See this</p><img src="cid:shot@x">'), size: 40 } },
          {
            mimeType: "image/png",
            filename: "shot.png",
            headers: [{ name: "Content-ID", value: "<shot@x>" }],
            body: { attachmentId: "att-inline", size: 1200 },
          },
          { mimeType: "application/pdf", filename: "invoice.pdf", body: { attachmentId: "att-file", size: 4000 } },
        ],
      },
    };
    const parsed = parseGmailMessage(related);
    const inline = parsed.attachments.find((a) => a.filename === "shot.png");
    const file = parsed.attachments.find((a) => a.filename === "invoice.pdf");
    expect(inline?.contentId).toBe("shot@x");
    expect(inline?.inline).toBe(true);
    expect(file?.inline).toBeFalsy();
  });
});

describe("normaliseCid", () => {
  it("strips the cid: scheme, angle brackets and case", () => {
    expect(normaliseCid("<ABC@Mail>")).toBe("abc@mail");
    expect(normaliseCid("cid:ABC@Mail")).toBe("abc@mail");
    expect(normaliseCid("  cid:<abc>  ")).toBe("abc");
  });
});

describe("sanitizeEmailHtml — embedded images", () => {
  it("ingest (no ctx) keeps a cid image but drops remote images and scripts", () => {
    const html = '<p>hi</p><img src="cid:logo@x"><img src="https://tracker.example.com/p.gif"><script>alert(1)</script>';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('src="cid:logo@x"');
    expect(out).not.toContain("tracker.example.com");
    expect(out).not.toContain("<script>");
  });

  it("render (ctx) rewrites a matched cid image to its auth-gated attachment URL", () => {
    const out = sanitizeEmailHtml('<p>x</p><img src="cid:logo@x">', {
      messageId: "m1",
      attachments: [{ contentId: "logo@x", mimeType: "image/png", stored: true }],
    });
    expect(out).toContain('src="/api/attachments/m1/0"');
  });

  it("render drops a cid with no matching stored image attachment", () => {
    const out = sanitizeEmailHtml('<img src="cid:missing@x">', {
      messageId: "m1",
      attachments: [{ contentId: "other@x", mimeType: "image/png", stored: true }],
    });
    expect(out).not.toContain("<img");
  });

  it("render never emits an attacker-supplied non-cid image source (no cross-message leak)", () => {
    const out = sanitizeEmailHtml('<img src="/api/attachments/OTHER/0"><img src="https://evil.example.com/x.png">', {
      messageId: "m1",
      attachments: [{ contentId: "logo@x", mimeType: "image/png", stored: true }],
    });
    expect(out).not.toContain("<img");
    expect(out).not.toContain("OTHER");
    expect(out).not.toContain("evil.example.com");
  });

  it("render will not point an <img> at a non-image attachment sharing the cid", () => {
    const out = sanitizeEmailHtml('<img src="cid:doc@x">', {
      messageId: "m1",
      attachments: [{ contentId: "doc@x", mimeType: "application/pdf", stored: true }],
    });
    expect(out).not.toContain("<img");
  });
});
