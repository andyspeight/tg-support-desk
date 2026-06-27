// Branded wrapper for customer-facing reply emails. Keeps the message itself
// front-and-centre but frames it so it reads as a real product email, not a
// bare line of text. Built table-first with inline styles for email-client
// robustness (Outlook/Gmail/Apple Mail); brand colours per travelgenix-design
// (navy #1b2b5b + teal #00b4d8), no images so nothing is blocked by default.

const FONT =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turn a plain-text reply (AI sends text, no HTML) into safe paragraphs with
 *  clickable links, so it gets the same branded treatment as a typed reply. */
export function textToEmailHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para
        .split("\n")
        .map((line) => linkify(escapeHtml(line)))
        .join("<br>");
      return `<p style="margin:0 0 14px;">${lines}</p>`;
    })
    .join("");
}

// Linkify bare URLs only (input is already HTML-escaped, so there are no tags
// to clash with). Trailing punctuation is left outside the link.
function linkify(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (url) => {
    return `<a href="${url}" style="color:#007a96;">${url}</a>`;
  });
}

export type CustomerEmailOptions = {
  /** The reply body as HTML (typed reply HTML, or textToEmailHtml(...) output). */
  bodyHtml: string;
  /** Ticket reference shown in the footer so the customer can quote it. */
  reference?: number | string | null;
  /** Public help-centre URL (env.appBaseUrl); linked in the footer when set. */
  helpUrl?: string;
  /** Current year for the footer; pass in so the template stays pure/testable. */
  year?: number;
};

export function renderCustomerEmail({ bodyHtml, reference, helpUrl, year }: CustomerEmailOptions): string {
  const refLine = reference
    ? `Reference: #${escapeHtml(String(reference))}<br>`
    : "";
  const help = helpUrl
    ? ` &middot; <a href="${escapeHtml(helpUrl)}" style="color:#8a8f98;text-decoration:underline;">Help centre</a>`
    : "";
  const yr = year ?? new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Travelgenix Support</title>
<style>
  body { margin:0; padding:0; width:100% !important; background:#f4f5f7; -webkit-text-size-adjust:100%; }
  .body p { margin:0 0 14px; }
  .body p:last-child { margin-bottom:0; }
  .body ul, .body ol { margin:0 0 14px; padding-left:22px; }
  .body li { margin:4px 0; }
  .body h2, .body h3 { margin:18px 0 8px; font-weight:600; }
  .body blockquote { margin:0 0 14px; padding-left:12px; border-left:3px solid #e4e4e7; color:#52525b; }
  .body a { color:#007a96; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; border-radius:0 !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#1b2b5b;padding:20px 28px;font-family:${FONT};">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Travelgenix</span><span style="font-size:18px;font-weight:600;color:#67d4e9;letter-spacing:-0.01em;">&nbsp;Support</span>
            </td>
          </tr>
          <tr><td style="height:3px;line-height:3px;font-size:0;background:#00b4d8;">&nbsp;</td></tr>
          <tr>
            <td class="body px" style="padding:28px;font-family:${FONT};font-size:15px;line-height:1.6;color:#1f2937;">
${bodyHtml}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:18px 28px 26px;border-top:1px solid #eef0f2;font-family:${FONT};font-size:12px;line-height:1.6;color:#8a8f98;">
              You can reply directly to this email — it reaches the same team.<br>
              ${refLine}<span style="color:#b0b4bb;">&copy; ${yr} Travelgenix${help}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
