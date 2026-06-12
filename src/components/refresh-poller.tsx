"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Interim live-inbox mechanism: refetch server data on an interval.
// Swap for Supabase Realtime (RLS-scoped JWT) when SSO token minting lands.
export function RefreshPoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
