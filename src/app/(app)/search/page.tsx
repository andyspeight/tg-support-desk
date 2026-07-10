import { env } from "@/lib/env";
import { SearchClient } from "@/components/search-client";
import { runSearchAction } from "./actions";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Search</h1>
      <p className="mt-1 text-sm text-ink-2">
        Tickets and conversations by keyword — ranked, with the match highlighted — plus the knowledge base by meaning.
      </p>
      <div className="mt-4">
        <SearchClient search={runSearchAction} agents={env.agentEmails} initialQuery={q ?? ""} />
      </div>
    </div>
  );
}
