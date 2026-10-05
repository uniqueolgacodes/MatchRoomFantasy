// PRD §9 Authentication & User Management. Settings (§20 Sound
// System, §19.5 Buddy) and Trophy Room (§25) stay their own
// dedicated pages, still stubs — this page covers identity: who you
// are, your MP balance, and the editable basics (display name,
// favourite team, Buddy on/off).
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { ProfileEditForm } from '@/components/profile/ProfileEditForm';
import { SignOutButton } from '@/components/profile/SignOutButton';

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const [{ data: profile }, balance] = await Promise.all([
    supabase.from('profiles').select('username, display_name, favourite_team_id, buddy_enabled, created_at').eq('id', user.id).maybeSingle(),
    getCurrentBalance(supabase, user.id),
  ]);

  const favouriteTeam = profile?.favourite_team_id
    ? (await supabase.from('teams').select('id, name, short_name, crest_url').eq('id', profile.favourite_team_id).maybeSingle()).data
    : null;

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  const initials = (profile?.display_name || profile?.username || '?').slice(0, 2).toUpperCase();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pitch/20 text-lg font-bold text-pitch-light">{initials}</span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">{profile?.display_name ?? profile?.username}</h1>
          <p className="text-sm text-white/40">
            @{profile?.username}
            {memberSince && ` · Member since ${memberSince}`}
          </p>
        </div>
        <div className="flex flex-col items-end rounded-lg bg-pitch/15 px-3.5 py-2">
          <span className="text-lg font-bold leading-none text-pitch-light">{balance}</span>
          <span className="mt-0.5 text-[11px] font-medium text-white/50">Match Points</span>
        </div>
      </div>

      {favouriteTeam && (
        <Link href={`/team/${favouriteTeam.id}`} className="mt-5 flex items-center gap-3 rounded-lg bg-ink-soft px-4 py-3 transition-colors hover:bg-white/[0.07]">
          {favouriteTeam.crest_url ? (
            <Image src={favouriteTeam.crest_url} alt={favouriteTeam.name} width={32} height={32} className="h-8 w-8 object-contain" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">{favouriteTeam.short_name}</span>
          )}
          <span className="text-sm font-semibold">{favouriteTeam.name}</span>
          <span className="ml-auto text-xs text-white/30">View Team Hub →</span>
        </Link>
      )}

      <div className="mt-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Edit profile</h2>
        <div className="mt-3">
          <ProfileEditForm
            userId={user.id}
            initialDisplayName={profile?.display_name ?? ''}
            initialFavouriteTeamId={profile?.favourite_team_id ?? null}
            initialBuddyEnabled={profile?.buddy_enabled ?? true}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-ink-soft px-4 py-3.5">
        <div className="flex gap-4">
          <Link href="/profile/settings" className="text-sm font-medium text-white/70 hover:text-white">
            Settings
          </Link>
          <Link href="/profile/trophies" className="text-sm font-medium text-white/70 hover:text-white">
            Trophy Room
          </Link>
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
