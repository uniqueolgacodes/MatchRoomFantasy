// PRD §15 Prediction & Selections System. Protected by middleware
// (added to PROTECTED there) — user is guaranteed non-null here.
//
// Predictions placed from this page are solo (roomId: null) — the
// same market staked here and from a room detail page for this match
// are two separate contexts per the unique index on
// (prediction_id, user_id, room_id), so predicting solo doesn't use
// up your one stake in a room for the same match, and vice versa.
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { PredictionsBoard } from '@/components/room/PredictionsBoard';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import { formatKickoff } from '@/lib/utils/format';

export default async function MatchPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects; keeps TS happy below

  const { data: match } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff, status, home_score, away_score, minute')
    .eq('id', params.id)
    .maybeSingle();

  if (!match) notFound();

  const [{ data: teams }, { data: predictions }, { data: linkedRooms }, balance] = await Promise.all([
    supabase.from('teams').select('id, name, short_name, crest_url').in('id', [match.home_team_id, match.away_team_id]),
    supabase
      .from('predictions')
      .select('id, question, category, options, odds_multiplier, locks_at, resolution_rule')
      .eq('match_id', match.id)
      .eq('phase', 'pre_match')
      .eq('status', 'open')
      .order('created_at', { ascending: true }),
    supabase.from('room_matches').select('rooms(id, name, room_code, visibility)').eq('match_id', match.id),
    getCurrentBalance(supabase, user.id),
  ]);

  const home = teams?.find((t) => t.id === match.home_team_id);
  const away = teams?.find((t) => t.id === match.away_team_id);

  const markets: Market[] = (predictions ?? []).map((p) => ({
    id: p.id,
    question: p.question,
    category: p.category,
    options: Array.isArray(p.options) ? p.options : [],
    odds_multiplier: Number(p.odds_multiplier),
    locks_at: p.locks_at,
    scoreOddsTable: p.resolution_rule?.odds_table,
    otherScoreOdds: p.resolution_rule?.other_odds ? Number(p.resolution_rule.other_odds) : undefined,
  }));

  let initialStakes: Record<string, StakeInfo> = {};
  if (markets.length > 0) {
    const { data: myStakes } = await supabase
      .from('prediction_stakes')
      .select('prediction_id, answer, stake')
      .in(
        'prediction_id',
        markets.map((m) => m.id)
      )
      .eq('user_id', user.id)
      .is('room_id', null);
    initialStakes = Object.fromEntries((myStakes ?? []).map((s) => [s.prediction_id, { answer: s.answer, stake: s.stake }]));
  }

  const publicRooms = (linkedRooms ?? [])
    .map((r) => r.rooms as { id: string; name: string; room_code: string; visibility: string } | null)
    .filter((r): r is NonNullable<typeof r> => r !== null && r.visibility === 'public');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Fixture header */}
      <div className="flex items-center justify-center gap-6">
        <TeamColumn name={home?.short_name ?? '?'} crestUrl={home?.crest_url ?? null} />
        <div className="text-center">
          {match.home_score !== null && match.away_score !== null ? (
            <p className="text-2xl font-bold tabular-nums">
              {match.home_score} – {match.away_score}
            </p>
          ) : (
            <p className="text-sm font-medium text-white/50">{formatKickoff(match.kickoff)}</p>
          )}
          <p className="mt-1 text-xs uppercase tracking-wide text-white/30">{match.status.replace('_', ' ')}</p>
        </div>
        <TeamColumn name={away?.short_name ?? '?'} crestUrl={away?.crest_url ?? null} />
      </div>

      <div className="mt-8">
        <PredictionsBoard roomId={null} markets={markets} initialBalance={balance} initialStakes={initialStakes} />
      </div>

      {/* Rooms for this match */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Rooms for this match</h2>
          <Link href={`/rooms/new?matchId=${match.id}`} className="text-xs font-medium text-pitch-light hover:text-pitch">
            Create a room
          </Link>
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
                <span className="text-xs text-white/40">Join →</span>
              </Link>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
              No rooms for this match yet — be the first to start one.
            </p>
          )}
        </div>
      </section>
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
