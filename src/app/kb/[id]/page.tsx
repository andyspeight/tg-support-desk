import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getPublishedKbArticle } from "@/lib/db/queries";
import { renderArticleHtml } from "@/lib/kb-render";
import { ThemeToggle } from "@/components/theme-toggle";

// Public, read-only help article. Top-level (no SSO) so a link sent in a reply
// just works for the customer. Only published articles are served — getPublished‑
// KbArticle returns null for anything draft/internal, which 404s here.

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = await getPublishedKbArticle(id).catch(() => null);
  return {
    title: article ? `${article.title} — Travelgenix Help` : "Travelgenix Help",
    robots: { index: false }, // article ids aren't meant to be crawled; share by link
  };
}

export default async function KbArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getPublishedKbArticle(id).catch(() => null);
  if (!article) notFound();

  const html = renderArticleHtml(article.body);
  const updated = new Date(article.updated_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/submit" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">Travelgenix Support</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <article>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{article.title}</h1>
          <p className="mt-2 text-xs text-ink-3">Updated {updated}</p>
          <div className="tg-prose mt-6 text-[15px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-ink-2">
          <span>
            Still need a hand?{" "}
            <Link href="/submit" className="font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200">
              Contact support
            </Link>
            .
          </span>
          <Link
            href="/submit"
            className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Help centre
          </Link>
        </div>
      </main>
    </div>
  );
}
