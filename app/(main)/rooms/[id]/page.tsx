// PRD §10, §24 Real-Time Infrastructure. Room chat (PRD §10.6) is NOT
// built yet — this covers who is in the room, how to invite people,
// predicting together on the match(es) it covers, and standings.
//
// Fixes in this version:
// - Each linked match gets its own phase. A match that is live or over
//   shows MatchPhasePanel (with the user's picks and outcome) instead
//   of an empty board that claimed "predictions open closer to
//   kickoff". Matches are ordered by kickoff, and a multi-match room
//   opens on the live / next match.
// - Archived rooms stay viewable (final standings, results) with
//   staking switched off, rather than looking like they vanished.
// - Standings come from room_standings, which lists every member, so
//   the leaderboard is not an empty box before the first settlement.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { RoomMatchesSection } from '@/components/room/RoomMatchesSection';
import { MatchPhasePanel } from '@/components/room/MatchPhasePanel';
import type { AccordionMatch } from '@/components/room/MatchAccordion';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import { JoinPublicRoomButton } from '@/components/room/JoinPublicRoomButton';
import { ShareRoomButton } from '@/components/room/ShareRoomButton';
import { formatKickoff } from '@/lib/utils/format';
import { buildPicks, deriveMatchPhase, phaseLabel, type MatchPhase } from '@/lib/matches/phase';

interface LinkedMatch {
  id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  is_virtual: boolean;
}

export default async function RoomPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const { data: room } = await supabase
    .from('rooms')
    .select('id, slug, name, description, room_code, visibility, room_type, owner_id, is_archived')
    .eq('id', params.id)
    .maybeSingle();

  if (!room) notFound();

  const { data: membership } = await supabase.from('room_members').select('user_id').eq('room_id', room.id).eq('user_id', user.id).maybeSingle();
  const isMember = !!membership;

  if (!isMember) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold">{room.name}</h1>
        {room.description && <p className="mt-2 text-sm text-white/50">{room.description}</p>}
        <div className="mt-6">
          {room.is_archived ? (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-4 text-sm text-white/40">This room has ended.</p>
          ) : room.visibility === 'public' ? (
            <JoinPublicRoomButton roomId={room.id} />
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-4 text-sm text-white/40">
              This is a private room — ask whoever invited you for the room code, then join at{' '}
              <Link href="/rooms/join" className="font-semibold text-pitch-light hover:text-pitch">
                /rooms/join
              </Link>
              .
            </p>
          )}
        </div>
      </main>
    );
  }

  const [{ data: linkedMatches }, balance, { data: standings }] = await Promise.all([
    supabase
      .from('room_matches')
      .select('matches(id, home_team_id, away_team_id, kickoff, status, home_score, away_score, minute, is_virtual)')
      .eq('room_id', room.id),
    getCurrentBalance(supabase, user.id),
    supabase
      .from('room_standings')
      .select('user_id, username, display_name, total_points, matches_played, rank')
      .eq('room_id', room.id)
      .order('rank', { ascending: true })
      .order('username', { ascending: true }),
  ]);

  const matches = (linkedMatches ?? [])
    .map((r) => r.matches as unknown as LinkedMatch | null)
    .filter((m): m is LinkedMatch => m !== null)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const teamIds = Array.from(new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id])));
  const matchIds = matches.map((m) => m.id);

  const [{ data: teams }, { data: predictionRows }] = await Promise.all([
    teamIds.length > 0 ? supabase.from('teams').select('id, short_name').in('id', teamIds) : Promise.resolve({ data: [] as { id: string; short_name: string }[] }),
    matchIds.length > 0
      ? supabase
        .from('predictions')
        .select('id, match_id, phase, status, question, category, options, odds_multiplier, locks_at, resolution_rule')
        .in('match_id', matchIds)
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const teamsById = new Map((teams ?? []).map((t) => [t.id, t.short_name]));
  const allPredictions = predictionRows ?? [];

  // This user's stakes in THIS room, across every market of every
  // linked match, locked and settled included.
  const { data: myStakes } =
    allPredictions.length > 0
      ? await supabase
        .from('prediction_stakes')
        .select('prediction_id, answer, stake, potential_payout, is_correct, points_awarded, settled_at')
        .in('prediction_id', allPredictions.map((p) => p.id))
        .eq('user_id', user.id)
        .eq('room_id', room.id)
      : { data: [] };

  const now = Date.now();
  const stakesByPrediction = new Map((myStakes ?? []).map((s) => [s.prediction_id, s]));
  const initialStakes: Record<string, StakeInfo> = {};

  const phases = new Map<string, MatchPhase>();
  const accordionMatches: AccordionMatch[] = matches.map((match) => {
    const phase = deriveMatchPhase(match.status, match.kickoff, now);
    phases.set(match.id, phase);
    const home = teamsById.get(match.home_team_id) ?? '?';
    const away = teamsById.get(match.away_team_id) ?? '?';

    const rowsForMatch = allPredictions.filter((p) => p.match_id === match.id);
    // No staking in an archived room, even if a market is technically still open.
    const openRows = room.is_archived
      ? []
      : rowsForMatch.filter((p) => p.phase === 'pre_match' && p.status === 'open' && new Date(p.locks_at).getTime() > now);

    const markets: Market[] = openRows.map((p) => ({
      id: p.id,
      question: p.question,
      category: p.category,
      options: Array.isArray(p.options) ? p.options : [],
      odds_multiplier: Number(p.odds_multiplier),
      locks_at: p.locks_at,
      scoreOddsTable: p.resolution_rule?.odds_table,
      otherScoreOdds: p.resolution_rule?.other_odds ? Number(p.resolution_rule.other_odds) : undefined,
    }));

    for (const p of openRows) {
      const stake = stakesByPrediction.get(p.id);
      if (stake) initialStakes[p.id] = { answer: stake.answer, stake: stake.stake };
    }

    const picks = buildPicks(
      rowsForMatch,
      rowsForMatch.map((p) => stakesByPrediction.get(p.id)).filter((s): s is NonNullable<typeof s> => !!s)
    );

    const hasScore = match.home_score !== null && match.away_score !== null;
    const chip =
      phase === 'upcoming'
        ? formatKickoff(match.kickoff)
        : phase === 'finished' && hasScore
          ? `FT ${match.home_score}–${match.away_score}`
          : phaseLabel(phase);

    return {
      matchId: match.id,
      markets,
      header: (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            {home} vs {away}
          </span>
          <span className={`shrink-0 text-xs ${phase === 'in_play' ? 'font-bold text-floodlight' : 'text-white/50'}`}>{chip}</span>
        </div>
      ),
      panel:
        markets.length === 0 ? (
          <MatchPhasePanel
            matchId={match.id}
            phase={phase}
            kickoff={match.kickoff}
            minute={match.minute}
            homeName={home}
            awayName={away}
            homeScore={match.home_score}
            awayScore={match.away_score}
            isVirtual={match.is_virtual}
            picks={picks}
          />
        ) : undefined,
    };
  });

  // Open on the live match, else the next one, else the most recent.
  const activeMatch = matches.find((m) => ['in_play', 'half_time', 'awaiting_result', 'upcoming'].includes(phases.get(m.id) ?? ''));
  const defaultOpenId = (activeMatch ?? matches[matches.length - 1])?.id ?? null;

  const anyPlayed = (standings ?? []).some((row) => row.matches_played > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">{room.name}</h1>
      {room.description && <p className="mt-1 text-sm text-white/50">{room.description}</p>}

      {room.is_archived && (
        <p className="mt-3 rounded-lg border border-white/10 bg-ink-soft px-4 py-3 text-xs text-white/50">
          This room has ended. Predictions are closed; results and final standings stay here.
        </p>
      )}

      {!room.is_archived && (
        <div className="mt-4">
          <ShareRoomButton slug={room.slug} name={room.name} code={room.room_code} />
        </div>
      )}

      {accordionMatches.length > 0 ? (
        <section className="mt-8">
          <RoomMatchesSection
            roomId={room.id}
            initialBalance={balance}
            initialStakes={initialStakes}
            matches={accordionMatches}
            defaultOpenId={defaultOpenId}
          />
        </section>
      ) : (
        <p className="mt-8 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
          No match linked to this room yet.
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">
          {room.is_archived ? 'Final standings' : 'Leaderboard'}
        </h2>
        {standings && standings.length > 0 ? (
          <>
            <div className="mt-3 flex flex-col gap-1">
              {standings.map((row) => {
                const isMe = row.user_id === user.id;
                const played = row.matches_played > 0;
                return (
                  <div
                    key={row.user_id}
                    className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 ${isMe ? 'bg-pitch/15 ring-1 ring-pitch/40' : 'bg-ink-soft'}`}
                  >
                    <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-white/40">{played ? row.rank : '–'}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.display_name ?? row.username}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-pitch-light">(you)</span>}
                    </span>
                    <span className="shrink-0 text-xs text-white/40">{row.matches_played} played</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-pitch-light">{row.total_points} pts</span>
                  </div>
                );
              })}
            </div>
            {!anyPlayed && <p className="mt-2 text-center text-xs text-white/30">Standings update as matches finish.</p>}
          </>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            No members yet.
          </p>
        )}
      </section>
    </main>
  );
}