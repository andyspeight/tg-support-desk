import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getKbArticle, getKbEffectiveness, kbCounts, listKbArticles } from "@/lib/db/queries";
import type { KbStatus } from "@/lib/db/types";
import { kbArticleFlag, type KbEffectiveness } from "@/lib/kb-effectiveness";
import { archiveArticleAction, publishArticleAction, saveArticleAction } from "./actions";

const TABS: { key: KbStatus; label: string }[] = [
  { key: "review", label: "Review queue" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

// Effectiveness line under each article: how often it answered tickets, and
// whether it lands (workhorse) or needs a look (review).
function UsageLine({ e }: { e: KbEffectiveness | undefined }) {
  if (!e || e.surfaced === 0) return null;
  const flag = kbArticleFlag(e);
  const cls =
    flag === "review"
      ? "text-amber-600 dark:text-amber-400"
      : flag === "workhorse"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-ink-3";
  const icon = flag === "review" ? "⚠ " : flag === "workhorse" ? "★ " : "";
  const label =
    e.cited > 0
      ? `${icon}used ${e.cited}× · ${e.resolveRate}% resolved${e.avgCsat != null ? ` · CSAT ${e.avgCsat}` : ""}`
      : `surfaced ${e.surfaced}×`;
  return <p className={`mt-0.5 truncate text-xs ${cls}`}>{label}</p>;
}

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string; new?: string }>;
}) {
  const { status: rawStatus, id, new: isNew } = await searchParams;
  const status: KbStatus = TABS.some((t) => t.key === rawStatus) ? (rawStatus as KbStatus) : "review";

  const [articles, counts, selected, eff] = await Promise.all([
    listKbArticles(status),
    kbCounts(),
    id ? getKbArticle(id) : Promise.resolve(null),
    getKbEffectiveness(),
  ]);

  const editing = isNew === "1" ? null : selected;
  const showEditor = isNew === "1" || Boolean(editing);

  return (
    <div className="flex h-full">
      {/* Article list. On mobile it's full-width and gives way to the editor when
          an article is open (master-detail → one pane at a time). */}
      <div
        className={`${showEditor ? "hidden lg:block" : "block"} w-full shrink-0 overflow-y-auto border-r border-line p-4 lg:w-96`}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Knowledge base</h1>
          <Link
            href={`/kb?status=${status}&new=1`}
            className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line"
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
                tab.key === status ? "bg-zinc-900 font-medium text-white dark:bg-surface-2 dark:text-ink" : "bg-surface-2 text-ink-2 hover:bg-line"
              }`}
            >
              {tab.label} {counts[tab.key]}
            </Link>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {articles.length === 0 && <p className="mt-6 text-center text-xs text-ink-3">Nothing here yet.</p>}
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/kb?status=${status}&id=${article.id}`}
              className={`block rounded-md border p-2.5 text-sm hover:border-ink-3 ${
                article.id === editing?.id ? "border-ink-3 bg-surface" : "border-line-soft bg-surface"
              }`}
            >
              <p className="truncate font-medium text-ink">{article.title}</p>
              <p className="mt-0.5 truncate text-xs text-ink-3">
                {article.source} · {new Date(article.updated_at).toLocaleDateString("en-GB")}
              </p>
              <UsageLine e={eff.get(article.id)} />
            </Link>
          ))}
        </div>
      </div>

      {/* Editor. Hidden on mobile until an article is open, then full-width with
          a back link to the list (which is hidden at that point on mobile). */}
      <div className={`${showEditor ? "block" : "hidden lg:block"} flex-1 overflow-y-auto p-4 sm:p-6`}>
        {!showEditor ? (
          <p className="mt-16 text-center text-sm text-ink-3">
            Select an article, or create a new one. Approving an article in the review queue publishes
            it — published articles are embedded immediately and start answering tickets.
          </p>
        ) : (
          // key on the article id forces the uncontrolled title/body fields to
          // remount (and so reset to the selected article) on every selection —
          // without it, a <textarea defaultValue> keeps the first body shown.
          <div key={editing?.id ?? "new"} className="mx-auto max-w-2xl">
            <Link
              href={`/kb?status=${status}`}
              className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> All articles
            </Link>
            <form action={saveArticleAction} className="space-y-3">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <input
                name="title"
                defaultValue={editing?.title ?? ""}
                placeholder="Article title"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base font-medium placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
              />
              <textarea
                name="body"
                defaultValue={editing?.body ?? ""}
                rows={20}
                placeholder="Write the article… plain text or markdown."
                className="w-full resize-y rounded-md border border-line bg-surface p-3 text-sm leading-relaxed placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-surface-2 dark:text-ink dark:hover:bg-line">
                  {editing ? "Save" : "Create draft"}
                </button>
                {editing && (
                  <span className="text-xs text-ink-3">
                    {editing.status} · source: {editing.source}
                  </span>
                )}
              </div>
            </form>

            {editing && (
              <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
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
                    <button className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">
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
