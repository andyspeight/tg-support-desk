import { describe, expect, it } from "vitest";
import {
  normaliseSubject,
  parseAddress,
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

describe("normaliseSubject", () => {
  it("strips reply/forward prefixes", () => {
    expect(normaliseSubject("RE: Re: Fwd: Widget broken")).toBe("widget broken");
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
