// Browser-side Supabase client with extended session configuration.
// PRD §9 Auth Strategy — phone OTP primary, Google OAuth, email fallback.
// Session timeout: 30 days (2,592,000 seconds) for relaxed user experience.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 30 days in seconds — users stay logged in for extended periods
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    },
  );
}
