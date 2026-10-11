// PRD §15 Prediction & Selections System. Protected by middleware
// (added to PROTECTED there) — user is guaranteed non-null here.
//
// Predictions placed from this page are solo (roomId: null) — the
// same market staked here and from a room detail page for this match
// are two separate contexts per the unique index on
// (prediction_id, user_id, room_id), so predicting solo doesn't use
// up your one stake in a room for the same match, and vice versa.
//
// Fixed: once a match kicked off its markets locked, the old "open
// only" query returned nothing and the page said "Predictions open
// closer to kickoff" mid-match. It now fetches every market for the
// match, shows the staking board only while some are still open, and
// otherwise shows MatchPhasePanel (live, half-time, awaiting result,
// or final outcome) together with the user's own picks.
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { PredictionsBoard } from '@/components/room/PredictionsBoard';
import { MatchPhasePanel } from '@/components/room/MatchPhasePanel';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import { formatKickoff } from '@/lib/utils/format';
import { buildPicks, deriveMatchPhase, phaseLabel } from '@/lib/matches/phase';

export default async function MatchPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects; keeps TS happy below

  const { data: match } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff, status, home_score, away_score, minute, is_virtual')
    .eq('id', params.id)
    .maybeSingle();

  if (!match) notFound();

  const [{ data: teams }, { data: predictionRows }, { data: linkedRooms }, balance] = await Promise.all([
    supabase.from('teams').select('id, name, short_name, crest_url').in('id', [match.home_team_id, match.away_team_id]),
    supabase
      .from('predictions')
      .select('id, phase, status, question, category, options, odds_multiplier, locks_at, resolution_rule')
      .eq('match_id', match.id)
      .order('created_at', { ascending: true }),
    supabase.from('room_matches').select('rooms(id, name, room_code, visibility, is_archived)').eq('match_id', match.id),
    getCurrentBalance(supabase, user.id),
  ]);

  const home = teams?.find((t) => t.id === match.home_team_id);
  const away = teams?.find((t) => t.id === match.away_team_id);

  const now = Date.now();
  const phase = deriveMatchPhase(match.status, match.kickoff, now);
  const allPredictions = predictionRows ?? [];

  // Only pre-match markets that are genuinely still open can be staked.
  const openRows = allPredictions.filter((p) => p.phase === 'pre_match' && p.status === 'open' && new Date(p.locks_at).getTime() > now);
  const openIds = new Set(openRows.map((p) => p.id));

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

  // The user's solo stakes on every market for this match, locked and
  // settled ones included, so the panel can show what they picked and
  // how it turned out.
  const { data: myStakes } =
    allPredictions.length > 0
      ? await supabase
        .from('prediction_stakes')
        .select('prediction_id, answer, stake, potential_payout, is_correct, points_awarded, settled_at')
        .in('prediction_id', allPredictions.map((p) => p.id))
        .eq('user_id', user.id)
        .is('room_id', null)
      : { data: [] };

  const initialStakes: Record<string, StakeInfo> = Object.fromEntries(
    (myStakes ?? []).filter((s) => openIds.has(s.prediction_id)).map((s) => [s.prediction_id, { answer: s.answer, stake: s.stake }])
  );
  const picks = buildPicks(allPredictions, myStakes ?? []);

  const publicRooms = (linkedRooms ?? [])
    .map((r) => r.rooms as unknown as { id: string; name: string; room_code: string; visibility: string; is_archived: boolean } | null)
    .filter((r): r is NonNullable<typeof r> => r !== null && r.visibility === 'public' && !r.is_archived);

  const hasScore = match.home_score !== null && match.away_score !== null;
  const canCreateRoom = phase === 'upcoming' && !match.is_virtual;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Fixture header */}
      <div className="flex items-center justify-center gap-6">
        <TeamColumn name={home?.short_name ?? '?'} crestUrl={home?.crest_url ?? null} />
        <div className="text-center">
          {hasScore && phase !== 'upcoming' ? (
            <p className="text-2xl font-bold tabular-nums">
              {match.home_score} – {match.away_score}
            </p>
          ) : (
            <p className="text-sm font-medium text-white/50">{formatKickoff(match.kickoff)}</p>
          )}
          <p className={`mt-1 text-xs uppercase tracking-wide ${phase === 'in_play' ? 'font-bold text-floodlight' : 'text-white/30'}`}>{phaseLabel(phase)}</p>
        </div>
        <TeamColumn name={away?.short_name ?? '?'} crestUrl={away?.crest_url ?? null} />
      </div>

      <div className="mt-8">
        {markets.length > 0 ? (
          <PredictionsBoard roomId={null} markets={markets} initialBalance={balance} initialStakes={initialStakes} />
        ) : (
          <MatchPhasePanel
            matchId={match.id}
            phase={phase}
            kickoff={match.kickoff}
            minute={match.minute}
            homeName={home?.short_name ?? '?'}
            awayName={away?.short_name ?? '?'}
            homeScore={match.home_score}
            awayScore={match.away_score}
            isVirtual={!!match.is_virtual}
            picks={picks}
          />
        )}
      </div>

      {/* Rooms for this match */}
      {!match.is_virtual && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Rooms for this match</h2>
            {canCreateRoom && (
              <Link href={`/rooms/new?matchId=${match.id}`} className="text-xs font-medium text-pitch-light hover:text-pitch">
                Create a room
              </Link>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {publicRooms.length > 0 ? (
              publicRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  className="flex items-center justify-between rounded-lg bg-ink-soft px-4 py-3 transition-colors hover:bg-white/[0.07]"
                >
                  <span className="text-sm font-semibold">{room.name}</span>
                  <span className="text-xs text-white/40">{phase === 'upcoming' ? 'Join →' : 'View →'}</span>
                </Link>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
                {canCreateRoom ? 'No rooms for this match yet. Be the first to start one.' : 'No open rooms for this match.'}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function TeamColumn({ name, crestUrl }: { name: string; crestUrl: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {crestUrl ? (
        <Image src={crestUrl} alt={name} width={40} height={40} className="h-10 w-10 object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{name}</span>
      )}
      <span className="text-xs font-semibold text-white/60">{name}</span>
    </div>
  );
}