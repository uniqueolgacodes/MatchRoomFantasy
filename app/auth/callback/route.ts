// OAuth callback handler for Google Sign-In
// Handles the PKCE flow and redirects user appropriately
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successfully logged in — redirect to intended page or home
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return user to login page if something went wrong
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
