import { Search } from "lucide-react";

/**
 * Search bar for the top of the inbox / dashboard. A plain GET form — no JS —
 * that submits the query to the results page (/staff/search?q=…), so search
 * lives where you work instead of in its own nav tab.
 */
export function TopSearch({
  defaultValue = "",
  placeholder = "Search tickets, conversations & knowledge base…",
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <form action="/staff/search" role="search" className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </form>
  );
}
