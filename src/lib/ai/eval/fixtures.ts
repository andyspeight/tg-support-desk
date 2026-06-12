import type { ToolExecutors } from "../types";

// Deterministic tool fixtures so eval results reflect prompt/loop changes,
// not live data. Grow FIXTURE_KB alongside the real KB's main topics.

export const FIXTURE_KB: { title: string; body: string }[] = [
  {
    title: "Embedding the Travelgenix booking widget",
    body: `To add the booking widget to any page of your website, paste the widget snippet just before the closing </body> tag:

<script src="https://widgets.travelify.io/embed.js" data-site-id="YOUR_SITE_ID" async></script>

Your site ID is shown in Dashboard → Settings → Widgets. To place the search form inside a specific container, add data-target="#element-id" to the snippet. Styling changes made in the dashboard take up to 5 minutes to appear on your site.`,
  },
  {
    title: "Supplier integration credentials",
    body: `Each supplier integration needs valid API credentials entered in Dashboard → Integrations. If a supplier shows the status "Credential error", re-enter the credentials issued by the supplier and press "Test connection". Credentials are re-validated hourly; a failed validation pauses that supplier's results in search.`,
  },
  {
    title: "Deeplink format",
    body: `Deeplinks follow the format https://YOURSITE/search?dest=CODE&out=YYYY-MM-DD&ret=YYYY-MM-DD&pax=2 — all four parameters are required and dest uses IATA codes. A malformed parameter makes the search page fall back to an empty form.`,
  },
];

export function fixtureExecutors(): ToolExecutors {
  return {
    search_kb: async (input) => {
      const query = String(input.query ?? "").toLowerCase();
      const terms = query.split(/\W+/).filter((t) => t.length > 3);
      const scored = FIXTURE_KB.map((article) => ({
        article,
        score: terms.filter((t) => `${article.title} ${article.body}`.toLowerCase().includes(t)).length,
      }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      if (!scored.length) return "No relevant published KB articles found.";
      return scored
        .slice(0, 3)
        .map((s) => `[similarity ${(0.5 + 0.1 * s.score).toFixed(2)}] ${s.article.title}\n${s.article.body}`)
        .join("\n\n---\n\n");
    },

    get_client_context: async () =>
      [
        "Airtable client record: recEVALFIXTURE00",
        "Company: Sunshine Travel Ltd",
        "Plan: Pro",
        "Supplier integrations: HotelBedsX (active), FlightHubY (active)",
        "Websites: sunshinetravel.example.com",
        "Luna Chat: installed",
      ].join("\n"),

    search_past_tickets: async () => "No similar resolved tickets found.",
  };
}
