import { describe, expect, it } from "vitest";
import {
  detectAutoReply,
  matchesBlocklist,
  normaliseSubject,
  parseAddress,
  parseAddressList,
  parseGmailMessage,
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
});
