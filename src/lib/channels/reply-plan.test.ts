import { describe, expect, it } from "vitest";
import { replyOutbound } from "./reply-plan";

describe("replyOutbound", () => {
  it("sends an email-channel reply only when the mailbox is wired", () => {
    expect(replyOutbound("email", true)).toBe("email");
  });

  // Regression: replying to a seeded/email ticket with Gmail unconfigured used
  // to hit required("GMAIL_CLIENT_ID") and crash the request. It must store,
  // never send.
  it("stores (never sends) an email reply when Gmail is not configured", () => {
    expect(replyOutbound("email", false)).toBe("store");
  });

  it("delivers non-email channels in-app regardless of mailbox config", () => {
    expect(replyOutbound("portal", false)).toBe("inapp");
    expect(replyOutbound("portal", true)).toBe("inapp");
    expect(replyOutbound("widget", false)).toBe("inapp");
  });
});
