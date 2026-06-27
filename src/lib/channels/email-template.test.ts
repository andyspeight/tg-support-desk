import { describe, expect, it } from "vitest";
import { renderCustomerEmail, textToEmailHtml } from "./email-template";

describe("textToEmailHtml", () => {
  it("wraps blank-line-separated blocks in paragraphs and single newlines in <br>", () => {
    const html = textToEmailHtml("Hi Sarah,\nThanks.\n\nAll sorted now.");
    expect(html).toBe(
      '<p style="margin:0 0 14px;">Hi Sarah,<br>Thanks.</p><p style="margin:0 0 14px;">All sorted now.</p>',
    );
  });

  it("escapes HTML so customer/AI text can't inject markup", () => {
    const html = textToEmailHtml('<script>alert("x")</script> & <b>bold</b>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;b&gt;bold");
  });

  it("linkifies bare URLs without swallowing trailing punctuation", () => {
    const html = textToEmailHtml("Rate us: https://help.travelgenix.io/csat/abc123.");
    expect(html).toContain('<a href="https://help.travelgenix.io/csat/abc123"');
    // the trailing full stop stays outside the link
    expect(html).toContain("abc123</a>.");
  });
});

describe("renderCustomerEmail", () => {
  it("frames the body in the branded shell with header, body and footer", () => {
    const out = renderCustomerEmail({ bodyHtml: "<p>Hello</p>", reference: 1043, year: 2026 });
    expect(out).toContain("<!DOCTYPE html>");
    expect(out).toContain("Travelgenix");
    expect(out).toContain("#1b2b5b"); // brand navy header
    expect(out).toContain("<p>Hello</p>"); // body injected verbatim
    expect(out).toContain("Reference: #1043");
    expect(out).toContain("&copy; 2026 Travelgenix");
  });

  it("omits the reference line and help link when not provided", () => {
    const out = renderCustomerEmail({ bodyHtml: "<p>Hi</p>" });
    expect(out).not.toContain("Reference:");
    expect(out).not.toContain("Help centre");
  });

  it("links the help centre when a URL is given", () => {
    const out = renderCustomerEmail({ bodyHtml: "<p>Hi</p>", helpUrl: "https://help.travelgenix.io" });
    expect(out).toContain('href="https://help.travelgenix.io"');
    expect(out).toContain("Help centre");
  });
});
