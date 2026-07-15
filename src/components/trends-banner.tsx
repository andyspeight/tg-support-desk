"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { TrendingUp, X } from "lucide-react";

export type ClusterLite = { key: string; label: string; count: number; emerging: boolean };

const KEY = "tg-trends-dismissed";
const EVT = "tg-trends-dismissed-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}
function readDismissedAt(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The "pop-up" on the inbox: surfaces issues trending in the last few days so
 *  agents notice a spike without opening the Insights page. Dismissal is keyed by
 *  the snapshot time (via useSyncExternalStore over localStorage), so a fresh
 *  snapshot brings it back. */
export function TrendsBanner({ clusters, computedAt }: { clusters: ClusterLite[]; computedAt: string }) {
  const dismissedAt = useSyncExternalStore(subscribe, readDismissedAt, () => null);
  if (clusters.length === 0 || dismissedAt === computedAt) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, computedAt);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVT));
  };

  const top = clusters.slice(0, 3);
  const more = clusters.length - top.length;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" strokeWidth={2} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          {clusters.length} issue{clusters.length === 1 ? "" : "s"} trending
        </p>
        <p className="mt-0.5 text-amber-800 dark:text-amber-200">
          {top.map((c, i) => (
            <span key={c.key}>
              {i > 0 ? " · " : ""}
              {c.label} <span className="text-amber-700/80 dark:text-amber-300/80">({c.count})</span>
            </span>
          ))}
          {more > 0 ? ` · +${more} more` : ""}{" "}
          <Link href="/staff/insights" className="font-medium underline underline-offset-2 hover:no-underline">
            view all
          </Link>
        </p>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-amber-700/70 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
