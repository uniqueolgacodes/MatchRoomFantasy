// Refreshes the Supabase session on every request, gates protected
// routes, and enforces the onboarding flow: a logged-in user who
// hasn't finished onboarding is redirected to it regardless of which
// protected page they tried to load, so no individual page has to
// remember to check this itself.
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that require a logged-in user at all (onboarding included —
// you need a session to have a profile row to onboard).
const PROTECTED = [
  '/rooms', '/profile', '/selections', '/world',
  '/trophies', '/revival', '/team', '/onboarding',
];

// Routes exempt from the "finish onboarding first" redirect, even
// though they require login. Keeps onboarding itself reachable and
// avoids redirect loops.
const ONBOARDING_EXEMPT = ['/onboarding'];

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((path) => pathname.startsWith(path));

  if (error || !user) {
    if (isProtected) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // User is authenticated — touch last_seen_at for welcome-back logic.
  try {
    await supabase.rpc('touch_last_seen', { p_user_id: user.id });
  } catch {
    // Non-fatal — welcome-back logic degrades gracefully without it.
  }

  const isOnboardingExempt = ONBOARDING_EXEMPT.some((path) => pathname.startsWith(path));
  if (!isOnboardingExempt) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && !profile.onboarding_completed_at) {
      return NextResponse.redirect(new URL('/onboarding/username', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
