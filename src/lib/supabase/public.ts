import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicClient: SupabaseClient | undefined;

export function createPublicClient(): SupabaseClient {
  if (publicClient) return publicClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing public Supabase configuration.");
  }

  publicClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publicClient;
}
