// PRD §10, §24 Real-Time Infrastructure. Chat and live leaderboard
// (PRD §10.6, §16.4) are NOT built yet — this covers what a
// match-linked room needs to actually be useful right now: who's in
// it, how to invite people, and predicting together on the match it
// covers.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { PredictionsBoard } from '@/components/room/PredictionsBoard';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';
import { JoinPublicRoomButton } from '@/components/room/JoinPublicRoomButton';
import { ShareRoomButton } from '@/components/room/ShareRoomButton';
import { formatKickoff } from '@/lib/utils/format';

export default async function RoomPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const { data: room } = await supabase
    .from('rooms')
    .select('id, slug, name, description, room_code, visibility, room_type, owner_id')
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
          {room.visibility === 'public' ? (
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

  const [{ data: linkedMatches }, balance] = await Promise.all([
    supabase.from('room_matches').select('matches(id, home_team_id, away_team_id, kickoff, status, home_score, away_score)').eq('room_id', room.id),
    getCurrentBalance(supabase, user.id),
  ]);

  const matches = (linkedMatches ?? [])
    .map((r) => r.matches as { id: string; home_team_id: string; away_team_id: string; kickoff: string; status: string; home_score: number | null; away_score: number | null } | null)
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const teamIds = Array.from(new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id])));
  const { data: teams } = teamIds.length > 0 ? await supabase.from('teams').select('id, short_name').in('id', teamIds) : { data: [] };
  const teamsById = new Map((teams ?? []).map((t) => [t.id, t.short_name]));

  // One match per room today (create_room links exactly one) — this
  // loop is here so a future season/community room with several
  // linked matches renders correctly without page changes.
  const marketsByMatch = await Promise.all(
    matches.map(async (match) => {
      const { data: predictions } = await supabase
        .from('predictions')
        .select('id, question, category, options, odds_multiplier, locks_at')
        .eq('match_id', match.id)
        .eq('phase', 'pre_match')
        .eq('status', 'open')
        .order('created_at', { ascending: true });

      const markets: Market[] = (predictions ?? []).map((p) => ({
        id: p.id,
        question: p.question,
        category: p.category,
        options: Array.isArray(p.options) ? p.options : [],
        odds_multiplier: Number(p.odds_multiplier),
        locks_at: p.locks_at,
      }));

      let initialStakes: Record<string, StakeInfo> = {};
      if (markets.length > 0) {
        const { data: myStakes } = await supabase
          .from('prediction_stakes')
          .select('prediction_id, answer, stake')
          .in('prediction_id', markets.map((m) => m.id))
          .eq('user_id', user.id)
          .eq('room_id', room.id);
        initialStakes = Object.fromEntries((myStakes ?? []).map((s) => [s.prediction_id, { answer: s.answer, stake: s.stake }]));
      }

      return { match, markets, initialStakes };
    })
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">{room.name}</h1>
      {room.description && <p className="mt-1 text-sm text-white/50">{room.description}</p>}

      <div className="mt-4">
        <ShareRoomButton slug={room.slug} name={room.name} code={room.room_code} />
      </div>

      {marketsByMatch.length > 0 ? (
        marketsByMatch.map(({ match, markets, initialStakes }) => (
          <section key={match.id} className="mt-8">
            <div className="flex items-center justify-between text-sm text-white/50">
              <span>
                {teamsById.get(match.home_team_id) ?? '?'} vs {teamsById.get(match.away_team_id) ?? '?'}
              </span>
              <span>{formatKickoff(match.kickoff)}</span>
            </div>
            <div className="mt-3">
              <PredictionsBoard roomId={room.id} markets={markets} initialBalance={balance} initialStakes={initialStakes} />
            </div>
          </section>
        ))
      ) : (
        <p className="mt-8 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
          No match linked to this room yet.
        </p>
      )}
    </main>
  );
}
