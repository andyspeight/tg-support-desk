import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Cluster recent support tickets into recurring problem THEMES, so the desk can
// surface "3+ tickets about the same thing" as a trend. The model only labels
// and groups; the caller enforces the count threshold and validates every
// reference against the real input set (the model never invents a ticket).

export type ClusterInput = { reference: number; subject: string; intent: string | null };
export type RawTheme = { label: string; description: string; references: number[] };

// Keep the call bounded and cheap: subjects are short, and at go-live volume a
// few days of tickets is well under this. If exceeded, the caller logs the cap.
export const CLUSTER_INPUT_CAP = 200;

const THEMES_TOOL: Anthropic.Tool = {
  name: "report_themes",
  description: "Report the recurring problem themes found across the tickets.",
  input_schema: {
    type: "object",
    properties: {
      themes: {
        type: "array",
        description: "One entry per recurring problem. Omit one-off issues.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Short plain-English statement of the customer's problem, e.g. \"Customers can't log in\".",
            },
            description: { type: "string", description: "One sentence describing the shared issue." },
            references: {
              type: "array",
              description: "The reference numbers of the tickets in this theme. Use ONLY numbers from the list.",
              items: { type: "number" },
            },
          },
          required: ["label", "description", "references"],
        },
      },
    },
    required: ["themes"],
  },
};

/**
 * Ask the model to group tickets into problem themes. Returns raw themes
 * (unfiltered) — the caller thresholds by count and maps references back to real
 * tickets. Never throws: returns [] on any error so the detector degrades to its
 * deterministic signals.
 */
export async function clusterTickets(
  tickets: ClusterInput[],
  opts: { apiKey: string; model: string },
): Promise<RawTheme[]> {
  if (tickets.length === 0) return [];
  const capped = tickets.slice(0, CLUSTER_INPUT_CAP);
  const lines = capped
    .map((t) => `#${t.reference}: ${t.subject.slice(0, 160)}${t.intent ? ` [${t.intent}]` : ""}`)
    .join("\n");

  try {
    const anthropic = new Anthropic({ apiKey: opts.apiKey, timeout: 30000 });
    const response = await anthropic.messages.create({
      model: opts.model,
      max_tokens: 1500,
      tools: [THEMES_TOOL],
      tool_choice: { type: "tool", name: "report_themes" },
      messages: [
        {
          role: "user",
          content:
            "These are recent B2B support tickets for Travelgenix (travel-technology: booking widgets, supplier integrations, deep links, dashboards). " +
            "Group them into recurring PROBLEM themes — tickets describing the same underlying issue a customer is hitting. " +
            "Give each theme a short, specific, plain-English label describing the problem (e.g. \"Customers can't log in\", \"Search returns no results\", \"Deposit setup failing\"), " +
            "a one-sentence description, and the reference numbers in it. Only include a theme if several tickets clearly share it; ignore one-offs. " +
            "Use ONLY the reference numbers listed.\n\n" +
            lines,
        },
      ],
    });
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) return [];
    const input = toolUse.input as { themes?: unknown };
    if (!Array.isArray(input.themes)) return [];
    return input.themes
      .map((t): RawTheme | null => {
        const theme = t as Record<string, unknown>;
        const label = typeof theme.label === "string" ? theme.label.trim() : "";
        const description = typeof theme.description === "string" ? theme.description.trim() : "";
        const references = Array.isArray(theme.references)
          ? theme.references.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
          : [];
        if (!label || references.length === 0) return null;
        return { label, description, references };
      })
      .filter((t): t is RawTheme => t !== null);
  } catch (error) {
    console.error("clusterTickets failed:", error);
    return [];
  }
}
