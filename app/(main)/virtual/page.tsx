// PRD virtual-match-simulator Phase 2 — the hub page. Live matches
// and upcoming sets need client-side interactivity (Realtime
// subscriptions, staking, countdowns) so those go through VirtualHub;
// recent results need neither, so they're plain server-rendered HTML
// straight in this file, in keeping with the "server-render whatever
// doesn't need to be interactive" discipline the rest of the app
// follows.
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { VirtualHub } from '@/components/virtual/VirtualHub';
import { VirtualIntroOverlay } from '@/components/virtual/VirtualIntroOverlay';
import { TeamBadge } from '@/components/virtual/TeamBadge';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import type { TickerEvent } from '@/components/virtual/EventTicker';

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  primary_color: string | null;
  secondary_color: string | null;
}

export default async function VirtualHubPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const [teamsRes, liveRes, upcomingRes, recentRes, balance, profileRes] = await Promise.all([
    supabase.from('teams').select('id, name, short_name, primary_color, secondary_color').eq('is_virtual', true),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, home_score, away_score, minute, status')
      .eq('is_virtual', true)
      .eq('status', 'live'),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, kickoff')
      .eq('is_virtual', true)
      .eq('status', 'scheduled')
      .gt('kickoff', new Date().toISOString())
      .order('kickoff', { ascending: true })
      .limit(6),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, home_score, away_score, kickoff')
      .eq('is_virtual', true)
      .eq('status', 'full_time')
      .order('kickoff', { ascending: false })
      .limit(6),
    getCurrentBalance(supabase, user.id),
    supabase.from('profiles').select('virtual_intro_seen_at').eq('id', user.id).maybeSingle(),
  ]);

  const teamsById = new Map((teamsRes.data ?? []).map((t: TeamRow) => [t.id, teamInfo(t)]));

  const liveMatchIds = (liveRes.data ?? []).map((m) => m.id);
  const upcomingMatchIds = (upcomingRes.data ?? []).map((m) => m.id);
  const allActiveMatchIds = [...liveMatchIds, ...upcomingMatchIds];

  const [eventsRes, predictionsRes] = await Promise.all([
    liveMatchIds.length > 0
      ? supabase
          .from('match_events')
          .select('id, match_id, type, minute, team_id')
          .in('match_id', liveMatchIds)
          .order('minute', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    allActiveMatchIds.length > 0
      ? supabase
          .from('predictions')
          .select('id, match_id, question, category, options, odds_multiplier, locks_at')
          .in('match_id', allActiveMatchIds)
          .eq('phase', 'pre_match')
          .eq('status', 'open')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const predictionIds = (predictionsRes.data ?? []).map((p) => p.id);
  const { data: myStakes } =
    predictionIds.length > 0
      ? await supabase
          .from('prediction_stakes')
          .select('prediction_id, answer, stake')
          .in('prediction_id', predictionIds)
          .eq('user_id', user.id)
          .is('room_id', null)
      : { data: [] as { prediction_id: string; answer: string; stake: number }[] };

  const initialStakes: Record<string, StakeInfo> = Object.fromEntries(
    (myStakes ?? []).map((s) => [s.prediction_id, { answer: s.answer, stake: s.stake }])
  );

  const marketsByMatch = new Map<string, Market[]>();
  for (const p of predictionsRes.data ?? []) {
    const market: Market = {
      id: p.id,
      question: p.question,
      category: p.category,
      options: Array.isArray(p.options) ? p.options : [],
      odds_multiplier: Number(p.odds_multiplier),
      locks_at: p.locks_at,
    };
    marketsByMatch.set(p.match_id, [...(marketsByMatch.get(p.match_id) ?? []), market]);
  }

  const eventsByMatch = new Map<string, TickerEvent[]>();
  for (const e of eventsRes.data ?? []) {
    const teamInfoRow = teamsById.get(e.team_id);
    eventsByMatch.set(e.match_id, [
      ...(eventsByMatch.get(e.match_id) ?? []),
      { id: e.id, type: e.type, minute: e.minute, teamShortName: teamInfoRow?.shortName ?? '?' },
    ]);
  }

  const liveMatches = (liveRes.data ?? []).map((m) => ({
    id: m.id,
    home: teamsById.get(m.home_team_id) ?? fallbackTeam(m.home_team_id),
    away: teamsById.get(m.away_team_id) ?? fallbackTeam(m.away_team_id),
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    minute: m.minute ?? 0,
    status: 'live' as const,
    events: eventsByMatch.get(m.id) ?? [],
  }));

  const upcomingByKickoff = new Map<string, { id: string; home: ReturnType<typeof teamInfo>; away: ReturnType<typeof teamInfo>; markets: Market[] }[]>();
  for (const m of upcomingRes.data ?? []) {
    const entry = {
      id: m.id,
      home: teamsById.get(m.home_team_id) ?? fallbackTeam(m.home_team_id),
      away: teamsById.get(m.away_team_id) ?? fallbackTeam(m.away_team_id),
      markets: marketsByMatch.get(m.id) ?? [],
    };
    upcomingByKickoff.set(m.kickoff, [...(upcomingByKickoff.get(m.kickoff) ?? []), entry]);
  }
  const upcomingSets = Array.from(upcomingByKickoff.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([kickoff, matches]) => ({ kickoff, matches }));

  const recentResults = (recentRes.data ?? []).map((m) => ({
    id: m.id,
    home: teamsById.get(m.home_team_id) ?? fallbackTeam(m.home_team_id),
    away: teamsById.get(m.away_team_id) ?? fallbackTeam(m.away_team_id),
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <VirtualIntroOverlay userId={user.id} initialShow={!profileRes.data?.virtual_intro_seen_at} />

      <VirtualHub
        liveMatches={liveMatches}
        upcomingSets={upcomingSets}
        initialBalance={balance}
        initialStakes={initialStakes}
      />

      {recentResults.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Recent results</h2>
          <div className="mt-3 flex flex-col gap-2">
            {recentResults.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-sm">
                  <TeamBadge shortName={m.home.shortName} primaryColor={m.home.primaryColor} secondaryColor={m.home.secondaryColor} size="sm" />
                  <span className="font-semibold text-white/80">{m.home.name}</span>
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {m.homeScore} – {m.awayScore}
                </span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="font-semibold text-white/80">{m.away.name}</span>
                  <TeamBadge shortName={m.away.shortName} primaryColor={m.away.primaryColor} secondaryColor={m.away.secondaryColor} size="sm" />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function teamInfo(t: TeamRow) {
  return {
    id: t.id,
    name: t.name,
    shortName: t.short_name,
    primaryColor: t.primary_color ?? '#374151',
    secondaryColor: t.secondary_color ?? '#ffffff',
  };
}

function fallbackTeam(id: string) {
  return { id, name: id, shortName: id.slice(0, 3).toUpperCase(), primaryColor: '#374151', secondaryColor: '#ffffff' };
}
