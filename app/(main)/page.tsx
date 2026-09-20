// Root route. Branches server-side (no client JS needed for this
// check) between the marketing landing page for logged-out visitors
// and the home feed for logged-in users. PRD §19.4 Personalized Feed
// is what eventually replaces the placeholder below.
import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/marketing/LandingPage';

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-white/60">
        Your matchday feed will live here — news, upcoming fixtures, and your rooms.
      </p>
    </main>
  );
}
