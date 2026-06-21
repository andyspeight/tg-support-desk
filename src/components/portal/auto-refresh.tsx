"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Live-ish updates: re-fetch the server-rendered thread on an interval so a
// client sees support replies appear without a manual refresh. Re-running the
// server component keeps auth + scoping intact (no client-side data access).
export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
