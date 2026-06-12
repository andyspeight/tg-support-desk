import Link from "next/link";
import { getKbArticle, kbCounts, listKbArticles } from "@/lib/db/queries";
import type { KbStatus } from "@/lib/db/types";
import { archiveArticleAction, publishArticleAction, saveArticleAction } from "./actions";

const TABS: { key: KbStatus; label: string }[] = [
  { key: "review", label: "Review queue" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string; new?: string }>;
}) {
  const { status: rawStatus, id, new: isNew } = await searchParams;
  const status: KbStatus = TABS.some((t) => t.key === rawStatus) ? (rawStatus as KbStatus) : "review";

  const [articles, counts, selected] = await Promise.all([
    listKbArticles(status),
    kbCounts(),
    id ? getKbArticle(id) : Promise.resolve(null),
  ]);

  const editing = isNew === "1" ? null : selected;
  const showEditor = isNew === "1" || Boolean(editing);

  return (
    <div className="flex h-full">
      {/* Article list */}
      <div className="w-96 shrink-0 overflow-y-auto border-r border-zinc-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Knowledge base</h1>
          <Link
            href={`/kb?status=${status}&new=1`}
            className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
          >
            New article
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/kb?status=${tab.key}`}
              className={`rounded-full px-2.5 py-1 text-xs ${
                tab.key === status ? "bg-zinc-900 font-medium text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {tab.label} {counts[tab.key]}
            </Link>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {articles.length === 0 && <p className="mt-6 text-center text-xs text-zinc-400">Nothing here yet.</p>}
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/kb?status=${status}&id=${article.id}`}
              className={`block rounded-md border p-2.5 text-sm hover:border-zinc-300 ${
                article.id === editing?.id ? "border-zinc-400 bg-white" : "border-zinc-100 bg-white"
              }`}
            >
              <p className="truncate font-medium text-zinc-800">{article.title}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-400">
                {article.source} · {new Date(article.updated_at).toLocaleDateString("en-GB")}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!showEditor ? (
          <p className="mt-16 text-center text-sm text-zinc-400">
            Select an article, or create a new one. Approving an article in the review queue publishes
            it — published articles are embedded immediately and start answering tickets.
          </p>
        ) : (
          <div className="mx-auto max-w-2xl">
            <form action={saveArticleAction} className="space-y-3">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <input
                name="title"
                defaultValue={editing?.title ?? ""}
                placeholder="Article title"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-base font-medium focus:border-zinc-400 focus:outline-none"
              />
              <textarea
                name="body"
                defaultValue={editing?.body ?? ""}
                rows={20}
                placeholder="Write the article… plain text or markdown."
                className="w-full resize-y rounded-md border border-zinc-200 bg-white p-3 text-sm leading-relaxed focus:border-zinc-400 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                  {editing ? "Save" : "Create draft"}
                </button>
                {editing && (
                  <span className="text-xs text-zinc-400">
                    {editing.status} · source: {editing.source}
                  </span>
                )}
              </div>
            </form>

            {editing && (
              <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-4">
                {editing.status !== "published" && (
                  <form action={publishArticleAction}>
                    <input type="hidden" name="id" value={editing.id} />
                    <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                      {editing.status === "review" ? "Approve & publish" : "Publish"}
                    </button>
                  </form>
                )}
                {editing.status !== "archived" && (
                  <form action={archiveArticleAction}>
                    <input type="hidden" name="id" value={editing.id} />
                    <button className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                      Archive
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
