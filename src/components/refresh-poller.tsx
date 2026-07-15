"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { anyDraftDirty } from "@/lib/draft-guard";

// Interim live-inbox mechanism: refetch server data on an interval.
// Swap for Supabase Realtime (RLS-scoped JWT) when SSO token minting lands.
//
// While an agent is typing a reply we skip the tick: a refresh that coincides
// with a new deployment forces a full page reload, which would wipe the draft.
// The composer resumes normal polling the moment the draft is sent or cleared.
export function RefreshPoller({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (anyDraftDirty()) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
