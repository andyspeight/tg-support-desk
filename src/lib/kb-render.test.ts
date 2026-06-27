import { describe, expect, it } from "vitest";
import { renderArticleHtml } from "./kb-render";

describe("renderArticleHtml", () => {
  it("wraps paragraphs", () => {
    const html = renderArticleHtml("First para.\n\nSecond para.");
    expect(html).toContain("<p>First para.</p>");
    expect(html).toContain("<p>Second para.</p>");
  });

  it("renders headings, bold, italic and lists", () => {
    expect(renderArticleHtml("# Heading")).toContain("<h2>Heading</h2>");
    expect(renderArticleHtml("## Sub")).toContain("<h3>Sub</h3>");
    expect(renderArticleHtml("Some **bold** text")).toContain("<strong>bold</strong>");
    expect(renderArticleHtml("Some _italic_ text")).toContain("<em>italic</em>");
    const ul = renderArticleHtml("- one\n- two");
    expect(ul).toContain("<ul>");
    expect(ul).toContain("<li>one</li>");
    const ol = renderArticleHtml("1. one\n2. two");
    expect(ol).toContain("<ol>");
    expect(ol).toContain("<li>one</li>");
  });

  it("renders markdown links as new-tab anchors", () => {
    const html = renderArticleHtml("See [the guide](https://help.travelgenix.io/x).");
    expect(html).toContain('href="https://help.travelgenix.io/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("the guide");
  });

  it("escapes raw HTML in the body", () => {
    const html = renderArticleHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never emits a javascript: href", () => {
    const html = renderArticleHtml("[click](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain('href="javascript');
  });
});
