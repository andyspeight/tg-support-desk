import { describe, expect, it } from "vitest";
import { buildKbHref, kbBestUrl, kbLinkHtml } from "./kb-links";

describe("buildKbHref", () => {
  it("builds an absolute URL when a base is given", () => {
    expect(buildKbHref("https://help.travelgenix.io", "abc")).toBe("https://help.travelgenix.io/kb/abc");
  });
  it("trims a trailing slash on the base", () => {
    expect(buildKbHref("https://help.travelgenix.io/", "abc")).toBe("https://help.travelgenix.io/kb/abc");
  });
  it("falls back to a relative path with no base", () => {
    expect(buildKbHref("", "abc")).toBe("/kb/abc");
    expect(buildKbHref(undefined, "abc")).toBe("/kb/abc");
  });
});

describe("kbBestUrl", () => {
  it("prefers the canonical source_url when present", () => {
    expect(
      kbBestUrl("https://help.travelgenix.io", { id: "x", source_url: "https://university.travelgenix.io/post/a" }),
    ).toBe("https://university.travelgenix.io/post/a");
  });
  it("falls back to the hosted help page when there is no source", () => {
    expect(kbBestUrl("https://help.travelgenix.io", { id: "x", source_url: null })).toBe(
      "https://help.travelgenix.io/kb/x",
    );
  });
});

describe("kbLinkHtml", () => {
  it("builds the reply snippet", () => {
    expect(kbLinkHtml({ title: "Adding a user", url: "https://h/kb/1" })).toBe(
      '<p>You might find this helpful: <a href="https://h/kb/1">Adding a user</a></p>',
    );
  });
  it("escapes the title and url so a stray title can't inject markup", () => {
    const html = kbLinkHtml({ title: '<b>x</b> & "y"', url: 'https://h/kb/1?a=1&b="2"' });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;");
    expect(html).toContain("a=1&amp;b=&quot;2&quot;");
  });
});
