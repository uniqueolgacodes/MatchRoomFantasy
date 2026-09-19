// Settles room leaderboards and the Private Room Winner Bonus.
// PRD v5 §17.3 — called from settle-predictions on success, not fired
// independently off the same trigger. This ordering matters: the
// room_match_leaderboard view only includes rows where
// prediction_stakes.is_correct is not null, which is only true once
// settle-predictions has finished writing.

import { supabase, Sentry } from '../_shared/clients.ts';

const PRIVATE_ROOM_MIN_MEMBERS = 3;
const PRIVATE_ROOM_WIN_BONUS = 10;

Deno.serve(async (req) => {
  const { match_id } = await req.json();

  const { data: lock } = await supabase
    .from('settlement_locks')
    .insert({ match_id, kind: 'room_match' })
    .select('match_id')
    .maybeSingle();

  if (!lock) {
    return Response.json({ ok: true, skipped: 'already settled' });
  }

  try {
    const { data: rooms } = await supabase
      .from('room_match_leaderboard')
      .select('room_id')
      .eq('match_id', match_id);

    const roomIds = [...new Set((rooms ?? []).map((r) => r.room_id))];
    let settledCount = 0;

    for (const roomId of roomIds) {
      const { data: rows } = await supabase
        .from('room_match_leaderboard')
        .select('*')
        .eq('room_id', roomId)
        .eq('match_id', match_id);

      const { count: registeredCount } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId);

      await supabase.from('room_match_scores').upsert(
        (rows ?? []).map((r: any, i: number) => ({
          room_id: roomId, match_id, user_id: r.user_id,
          points_earned: r.points_earned, points_staked: r.points_staked,
          points_won: r.points_won, rank: i + 1,
          settled_at: new Date().toISOString(),
        }))
      );
      settledCount++;

      if ((registeredCount ?? 0) < PRIVATE_ROOM_MIN_MEMBERS || !rows || rows.length === 0) continue;

      const sorted = [...rows].sort((a: any, b: any) => b.points_earned - a.points_earned);
      const tied = sorted.length > 1 && sorted[0].points_earned === sorted[1].points_earned;
      if (tied || sorted[0].points_earned <= 0) continue;

      const winner = sorted[0];
      await supabase.rpc('apply_point_transaction', {
        p_user_id: winner.user_id, p_amount: PRIVATE_ROOM_WIN_BONUS, p_reason: 'private_room_win',
        p_metadata: { room_id: roomId, match_id },
      });

      // Winner card generation — see app/api/awards/[roomId]/image/route.tsx
      await supabase.from('room_awards').insert({
        room_id: roomId, user_id: winner.user_id, award_type: 'match_winner',
        points: winner.points_earned, metadata: { match_id },
      });
    }

    return Response.json({ ok: true, rooms_settled: settledCount });
  } catch (err) {
    Sentry.captureException(err, { extra: { match_id } });
    await supabase.from('settlement_locks').delete().eq('match_id', match_id).eq('kind', 'room_match');
    return new Response('room-match settlement failed', { status: 500 });
  }
});
