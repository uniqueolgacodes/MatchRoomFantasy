// app/(main)/virtual/page.tsx
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { VirtualHub } from '@/components/virtual/VirtualHub';
import { VirtualIntroOverlay } from '@/components/virtual/VirtualIntroOverlay';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import type { TickerEvent } from '@/components/virtual/EventTicker';
import type { MyPick } from '@/components/virtual/LiveMatchCard';

interface TeamRow {
  id: string; name: string; short_name: string; primary_color: string | null; secondary_color: string | null;
}

export default async function VirtualHubPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [seasonRes, teamsRes, balance, profileRes, standingsRes] = await Promise.all([
    supabase.from('virtual_seasons').select('*').eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('teams').select('id, name, short_name, primary_color, secondary_color').eq('is_virtual', true),
    getCurrentBalance(supabase, user.id),
    supabase.from('profiles').select('virtual_intro_seen_at').eq('id', user.id).maybeSingle(),
    supabase.from('virtual_standings').select('*')
  ]);

  const activeSeason = seasonRes.data ? `Virtual-S${seasonRes.data.season_number}` : 'none';
  const matchday = seasonRes.data?.current_matchday ?? 1;

  const [liveRes, upcomingRes] = await Promise.all([
    supabase.from('matches').select('id, home_team_id, away_team_id, home_score, away_score, minute, status')
      .eq('is_virtual', true).eq('season', activeSeason).in('status', ['live', 'full_time']).order('kickoff', { ascending: false }).limit(10),
    supabase.from('matches').select('id, home_team_id, away_team_id, kickoff')
      .eq('is_virtual', true).eq('status', 'scheduled').order('kickoff', { ascending: true }).limit(10),
  ]);

  const teamsById = new Map((teamsRes.data ?? []).map((t: TeamRow) => [t.id, teamInfo(t)]));
  const liveMatchIds = (liveRes.data ?? []).map(m => m.id);
  const upcomingMatchIds = (upcomingRes.data ?? []).map(m => m.id);
  const allActiveMatchIds = [...liveMatchIds, ...upcomingMatchIds];

  const [eventsRes, predictionsRes, livePredictionsRes] = await Promise.all([
    liveMatchIds.length > 0 ? supabase.from('match_events').select('id, match_id, type, minute, team_id').in('match_id', liveMatchIds).order('minute', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    allActiveMatchIds.length > 0 ? supabase.from('predictions').select('id, match_id, question, category, options, odds_multiplier, locks_at, resolution_rule').in('match_id', allActiveMatchIds).eq('phase', 'pre_match').eq('status', 'open').order('created_at', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
    liveMatchIds.length > 0 ? supabase.from('predictions').select('id, match_id, question').in('match_id', liveMatchIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  const predictionIds = (predictionsRes.data ?? []).map(p => p.id);
  const livePredictionIds = (livePredictionsRes.data ?? []).map(p => p.id);

  const [myStakesRes, liveStakesRes] = await Promise.all([
    predictionIds.length > 0 ? supabase.from('prediction_stakes').select('prediction_id, answer, stake').in('prediction_id', predictionIds).eq('user_id', user.id).is('room_id', null) : Promise.resolve({ data: [] as any[] }),
    livePredictionIds.length > 0 ? supabase.from('prediction_stakes').select('prediction_id, answer, stake').in('prediction_id', livePredictionIds).eq('user_id', user.id).is('room_id', null) : Promise.resolve({ data: [] as any[] }),
  ]);

  const initialStakes: Record<string, StakeInfo> = Object.fromEntries((myStakesRes.data ?? []).map((s: any) => [s.prediction_id, { answer: s.answer, stake: s.stake }]));

  const livePredictionMeta = new Map((livePredictionsRes.data ?? []).map(p => [p.id, { question: p.question, matchId: p.match_id }]));
  const picksByMatch = new Map<string, MyPick[]>();
  for (const s of liveStakesRes.data ?? []) {
    const meta = livePredictionMeta.get(s.prediction_id);
    if (!meta) continue;
    picksByMatch.set(meta.matchId, [...(picksByMatch.get(meta.matchId) ?? []), { question: meta.question, answer: s.answer, stake: s.stake }]);
  }

  const marketsByMatch = new Map<string, Market[]>();
  for (const p of predictionsRes.data ?? []) {
    marketsByMatch.set(p.match_id, [...(marketsByMatch.get(p.match_id) ?? []), { id: p.id, question: p.question, category: p.category, options: Array.isArray(p.options) ? p.options : [], odds_multiplier: Number(p.odds_multiplier), locks_at: p.locks_at, scoreOddsTable: p.resolution_rule?.odds_table, otherScoreOdds: p.resolution_rule?.other_odds ? Number(p.resolution_rule.other_odds) : undefined }]);
  }

  const eventsByMatch = new Map<string, TickerEvent[]>();
  for (const e of eventsRes.data ?? []) {
    eventsByMatch.set(e.match_id, [...(eventsByMatch.get(e.match_id) ?? []), { id: e.id, type: e.type, minute: e.minute, teamShortName: teamsById.get(e.team_id)?.shortName ?? '?' }]);
  }

  const liveMatches = (liveRes.data ?? []).map(m => ({
    id: m.id, home: teamsById.get(m.home_team_id)!, away: teamsById.get(m.away_team_id)!,
    homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, minute: m.minute ?? 0, status: m.status as 'live' | 'full_time',
    events: eventsByMatch.get(m.id) ?? [], picks: picksByMatch.get(m.id) ?? [],
  }));

  const upcomingSets = Array.from(new Set((upcomingRes.data ?? []).map(m => m.kickoff))).sort().map(kickoff => ({
    kickoff, matches: (upcomingRes.data ?? []).filter(m => m.kickoff === kickoff).map(m => ({ id: m.id, home: teamsById.get(m.home_team_id)!, away: teamsById.get(m.away_team_id)!, markets: marketsByMatch.get(m.id) ?? [] }))
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <VirtualIntroOverlay userId={user.id} initialShow={!profileRes.data?.virtual_intro_seen_at} />
      <VirtualHub
        liveMatches={liveMatches}
        upcomingSets={upcomingSets}
        initialBalance={balance}
        initialStakes={initialStakes}
        standings={standingsRes.data ?? []}
        seasonInfo={{ number: seasonRes.data?.season_number ?? 1, matchday }}
      />
    </main>
  );
}

function teamInfo(t: TeamRow) { return { id: t.id, name: t.name, shortName: t.short_name, primaryColor: t.primary_color ?? '#374151', secondaryColor: t.secondary_color ?? '#ffffff' }; }