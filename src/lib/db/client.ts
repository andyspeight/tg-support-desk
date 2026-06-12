import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env } from "@/lib/env";

let client: SupabaseClient<Database> | null = null;

// Service-role client. Server-side only — RLS is the safety net for any
// future browser access (realtime tokens), never a path for the service key.
export function db(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
