"use client";

import { useState, useTransition, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import type { EraseResult } from "@/app/staff/settings/actions";

/**
 * Owner-only maintenance: one button that runs a repair over past tickets and
 * reports what it did. Every job behind it is safe to run more than once.
 */
export function MaintenancePanel({
  title,
  description,
  action,
  idleLabel,
  busyLabel,
  Icon,
  run,
}: {
  title: string;
  description: string;
  action: string;
  idleLabel: string;
  busyLabel: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  run: () => Promise<EraseResult>;
}) {
  const [result, setResult] = useState<EraseResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">{description}</p>

      <button
        onClick={() => start(async () => setResult(await run()))}
        disabled={pending}
        aria-label={action}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        )}
        {pending ? busyLabel : idleLabel}
      </button>

      {result && (
        <p
          className={`mt-2 text-xs ${
            result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
