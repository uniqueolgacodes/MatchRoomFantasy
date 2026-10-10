// Settings. Notifications only for now: the Sound (§20) and Buddy
// (§19.5) sections from the PRD are still unbuilt, and Buddy on/off
// already lives on the profile page's edit form. Add them as sibling
// sections here when they exist.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NotificationSettings } from '@/components/settings/NotificationSettings';

// Postgres returns `time` as HH:MM:SS; the time inputs want HH:MM.
const toHHMM = (value: string | null, fallback: string) => (value ? value.slice(0, 5) : fallback);

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const [{ data: profile }, { count: deviceCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('notify_push_enabled, notify_kickoff, notify_room_activity, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('provider', 'onesignal'),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white">
        ← Back
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Choose what we notify you about, and when.</p>

      <div className="mt-6">
        <NotificationSettings
          userId={user.id}
          hasRegisteredDevice={(deviceCount ?? 0) > 0}
          initial={{
            pushEnabled: profile?.notify_push_enabled ?? true,
            kickoff: profile?.notify_kickoff ?? true,
            roomActivity: profile?.notify_room_activity ?? true,
            quietEnabled: profile?.quiet_hours_enabled ?? true,
            quietStart: toHHMM(profile?.quiet_hours_start ?? null, '22:00'),
            quietEnd: toHHMM(profile?.quiet_hours_end ?? null, '07:00'),
            timezone: profile?.timezone ?? 'Africa/Lagos',
          }}
        />
      </div>
    </main>
  );
}