import sanitizeHtml from "sanitize-html";

// Render a KB article body (plain text or a small markdown subset) to safe HTML
// for the public help page. Authored/ingested content is treated as untrusted:
// we escape first, build only a known set of tags, then sanitize as a backstop
// (drops any javascript: hrefs, stray attributes, etc.).

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "h2", "h3", "ul", "ol", "li", "a", "blockquote", "code", "pre"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline markdown on already-escaped text: bold, italic, and [text](url) links
// (http/https only; other schemes fall through as plain text and are dropped by
// the sanitizer anyway).
function inline(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderArticleHtml(body: string | null | undefined): string {
  const blocks = (body ?? "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading && lines.length === 1) {
      const tag = heading[1].length === 1 ? "h2" : "h3";
      out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`);
    } else if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")}</ol>`);
    } else if (lines.every((l) => /^\s*>\s?/.test(l))) {
      const inner = inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n")).replace(/\n/g, "<br>");
      out.push(`<blockquote>${inner}</blockquote>`);
    } else {
      out.push(`<p>${inline(block).replace(/\n/g, "<br>")}</p>`);
    }
  }
  return sanitizeHtml(out.join("\n"), ALLOWED);
}
