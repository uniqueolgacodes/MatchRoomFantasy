// Refreshes the Supabase session on every request and touches
// last_seen_at (PRD §9.5, welcome-back logic depends on this being
// current). Also gates the small set of protected routes.
// Extended session timeout: 30 days for relaxed user experience.
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = [
  "/rooms",
  "/profile",
  "/selections",
  "/world",
  "/trophies",
  "/revival",
  "/team",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // If there's an auth error (e.g., expired session), redirect to login
  if (error || !user) {
    const isProtected = PROTECTED.some((path) =>
      request.nextUrl.pathname.startsWith(path),
    );
    if (isProtected) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // User is authenticated — touch last_seen_at for welcome-back logic
  try {
    await supabase.rpc("touch_last_seen", { p_user_id: user.id });
  } catch {
    // RPC might not exist yet, ignore error
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
