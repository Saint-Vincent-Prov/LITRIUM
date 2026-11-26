import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined;
const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || undefined;

/** Online mode is on as soon as both public Supabase values are set. */
export const ONLINE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}
