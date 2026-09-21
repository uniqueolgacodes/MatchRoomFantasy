// Root route. Branches server-side (no client JS needed for this
// check) between the marketing landing page for logged-out visitors
// and the home feed for logged-in users.
//
// The feed itself (PRD §19.4 Personalized Feed) stays a server
// component too — every section below is plain server-rendered HTML,
// no client JS shipped for it, in keeping with the same "cheap on
// first load" discipline as the landing page. The only client-side
// piece on this route is the header's UserMenu, already mounted in
// the (main) layout.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/marketing/LandingPage';
import { RoomListCard } from '@/components/room/RoomListCard';
import { FixtureCard } from '@/components/feed/FixtureCard';
import { NewsCard } from '@/components/feed/NewsCard';

// Mirrors public.current_season() (0001_init.sql) — used only if the
// RPC call fails, so the page still renders a sensible balance/room
// lookup instead of erroring out.
function fallbackSeason(): string {
  const now = new Date();
  const y = now.getFullYear();
  const month = now.getMonth() + 1; // JS is 0-indexed, SQL extract() is 1-indexed
  return month >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const ROOM_TYPE_RANK: Record<string, number> = {
  season_league: 0,
  general: 1,
  match_public: 2,
  private: 3,
  community: 4,
};

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  const [seasonRes, profileRes, roomsRes, userTeamsRes, fixturesRes, teamsRes] = await Promise.all([
    supabase.rpc('current_season'),
    supabase.from('profiles').select('username, display_name, favourite_team_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('room_members')
      .select('rooms(id, name, room_type, is_official, is_pinned)')
      .eq('user_id', user.id),
    supabase.from('user_teams').select('team_id').eq('user_id', user.id),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, kickoff, status, home_score, away_score, minute')
      .in('status', ['scheduled', 'live', 'half_time'])
      .order('kickoff', { ascending: true })
      .limit(8),
    supabase.from('teams').select('id, short_name, crest_url'),
  ]);

  const season = (seasonRes.data as string | null) ?? fallbackSeason();
  const profile = profileRes.data;
  const followedTeamIds = (userTeamsRes.data ?? []).map((row) => row.team_id as string);

  const [balanceRes, newsRes] = await Promise.all([
    supabase.from('point_balances').select('balance').eq('user_id', user.id).eq('season', season).maybeSingle(),
    followedTeamIds.length > 0
      ? supabase
          .from('news_articles')
          .select('title, summary, source, url, published_at')
          .overlaps('team_ids', followedTeamIds)
          .order('published_at', { ascending: false })
          .limit(6)
      : supabase.from('news_articles').select('title, summary, source, url, published_at').order('published_at', { ascending: false }).limit(6),
  ]);

  // PRD §11.1 — 10 MP is the starting balance. A brand-new user has
  // no point_balances row at all until their first transaction, so
  // "no row" reads as 10, not 0.
  const balance = balanceRes.data?.balance ?? 10;

  const rooms = (roomsRes.data ?? [])
    .map((row) => row.rooms as { id: string; name: string; room_type: string; is_official: boolean; is_pinned: boolean } | null)
    .filter((room): room is NonNullable<typeof room> => room !== null)
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return (ROOM_TYPE_RANK[a.room_type] ?? 9) - (ROOM_TYPE_RANK[b.room_type] ?? 9);
    });

  const teamsById = new Map(
    (teamsRes.data ?? []).map((t) => [t.id as string, { shortName: t.short_name as string, crestUrl: t.crest_url as string | null }])
  );
  const followedSet = new Set(followedTeamIds);
  const fixtures = [...(fixturesRes.data ?? [])].sort((a, b) => {
    const aFollowed = followedSet.has(a.home_team_id) || followedSet.has(a.away_team_id);
    const bFollowed = followedSet.has(b.home_team_id) || followedSet.has(b.away_team_id);
    if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
    return 0; // already chronological from the query
  });

  const news = newsRes.data ?? [];
  const firstName = profile?.display_name && profile.display_name !== 'New Fan' ? profile.display_name.split(' ')[0] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Greeting + MP balance */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {firstName ? `Hey, ${firstName}` : `Hey, ${profile?.username ?? 'there'}`}
          </h1>
          <p className="mt-0.5 text-sm text-white/50">Here's what's happening this week.</p>
        </div>
        <Link
          href="/selections"
          className="flex flex-col items-end rounded-lg bg-pitch/15 px-3.5 py-2 transition-colors hover:bg-pitch/25"
        >
          <span className="text-lg font-bold leading-none text-pitch-light">{balance}</span>
          <span className="mt-0.5 text-[11px] font-medium text-white/50">Match Points</span>
        </Link>
      </div>

      {/* Quick nav */}
      <div className="mt-5 flex flex-wrap gap-2">
        <QuickNavPill href="/rooms" label="Your Rooms" />
        <QuickNavPill href="/rooms/discover" label="Discover" />
        <QuickNavPill href="/world" label="World Rankings" />
        <QuickNavPill href="/selections" label="My Selections" />
        {profile?.favourite_team_id && <QuickNavPill href={`/team/${profile.favourite_team_id}`} label="My Team" />}
      </div>

      {/* Your Rooms */}
      <Section title="Your Rooms" action={{ href: '/rooms/discover', label: 'Discover more' }}>
        {rooms.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {rooms.map((room) => (
              <RoomListCard key={room.id} id={room.id} name={room.name} roomType={room.room_type} isOfficial={room.is_official} />
            ))}
          </div>
        ) : (
          <EmptyState
            text="You haven't joined any rooms yet."
            action={{ href: '/rooms/discover', label: 'Discover rooms' }}
          />
        )}
      </Section>

      {/* Upcoming fixtures */}
      <Section title="Fixtures">
        {fixtures.length > 0 ? (
          <div className="flex flex-col gap-2">
            {fixtures.map((match) => {
              const home = teamsById.get(match.home_team_id);
              const away = teamsById.get(match.away_team_id);
              return (
                <FixtureCard
                  key={match.id}
                  homeShortName={home?.shortName ?? match.home_team_id.slice(0, 3).toUpperCase()}
                  awayShortName={away?.shortName ?? match.away_team_id.slice(0, 3).toUpperCase()}
                  homeCrestUrl={home?.crestUrl ?? null}
                  awayCrestUrl={away?.crestUrl ?? null}
                  kickoff={match.kickoff}
                  status={match.status}
                  homeScore={match.home_score}
                  awayScore={match.away_score}
                  minute={match.minute}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState text="No fixtures on the board yet — check back once the season's underway." />
        )}
      </Section>

      {/* News */}
      {news.length > 0 && (
        <Section title={followedTeamIds.length > 0 ? 'News for you' : 'Trending'}>
          <div className="flex flex-col gap-2">
            {news.map((article) => (
              <NewsCard
                key={article.url}
                title={article.title}
                summary={article.summary}
                source={article.source}
                url={article.url}
                publishedAt={article.published_at}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Follow-a-team nudge, only for users who haven't set one */}
      {!profile?.favourite_team_id && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
          <p className="text-sm text-white/60">Follow a team to personalize your news and fixtures.</p>
          <Link href="/profile/settings" className="shrink-0 text-sm font-semibold text-pitch-light hover:text-pitch">
            Set team
          </Link>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">{title}</h2>
        {action && (
          <Link href={action.href} className="text-xs font-medium text-pitch-light hover:text-pitch">
            {action.label}
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function QuickNavPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
    >
      {label}
    </Link>
  );
}

function EmptyState({ text, action }: { text: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center">
      <p className="text-sm text-white/40">{text}</p>
      {action && (
        <Link href={action.href} className="mt-2 inline-block text-sm font-semibold text-pitch-light hover:text-pitch">
          {action.label} →
        </Link>
      )}
    </div>
  );
}
