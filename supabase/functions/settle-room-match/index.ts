// Settles room leaderboards and the room winner bonus.
// PRD v5 §17.3 — called from settle-predictions on success, so every
// stake for the match already has its settled_at/points_awarded.
//
// What was wrong before: it copied rows from room_match_leaderboard
// (one row per user PER MARKET) into room_match_scores, which is unique
// on (room_id, match_id, user_id). Any user with stakes on two or more
// markets broke the upsert, the error was never checked, and the
// function returned ok with nothing written. Scores are now summed per
// user by refresh_room_match_scores() in SQL (migration 0031), every
// call below has its error checked, and a failure throws so the
// settlement lock is released and a retry can run.
import { supabase, Sentry } from "../_shared/clients.ts";

const ROOM_WIN_MIN_MEMBERS = 3;
const ROOM_WIN_BONUS = 10;

Deno.serve(async (req) => {
  const { match_id } = await req.json();

  const { data: lock } = await supabase
    .from("settlement_locks")
    .insert({ match_id, kind: "room_match" })
    .select("match_id")
    .maybeSingle();

  if (!lock) {
    return Response.json({ ok: true, skipped: "already settled" });
  }

  try {
    const { error: refreshError } = await supabase.rpc(
      "refresh_room_match_scores",
      { p_match_id: match_id },
    );
    if (refreshError) throw refreshError;

    const { data: scores, error: scoresError } = await supabase
      .from("room_match_scores")
      .select("room_id, user_id, points_earned")
      .eq("match_id", match_id);
    if (scoresError) throw scoresError;

    const byRoom = new Map<
      string,
      { user_id: string; points_earned: number }[]
    >();
    for (const s of scores ?? []) {
      const list = byRoom.get(s.room_id) ?? [];
      list.push({ user_id: s.user_id, points_earned: s.points_earned });
      byRoom.set(s.room_id, list);
    }

    let awards = 0;
    for (const [roomId, rows] of byRoom) {
      const { count: memberCount, error: countError } = await supabase
        .from("room_members")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId);
      if (countError) throw countError;
      if ((memberCount ?? 0) < ROOM_WIN_MIN_MEMBERS) continue;

      const sorted = [...rows].sort(
        (a, b) => b.points_earned - a.points_earned,
      );
      const winner = sorted[0];
      const tied =
        sorted.length > 1 && sorted[1].points_earned === winner.points_earned;
      if (tied || winner.points_earned <= 0) continue;

      // Idempotency: the award row is the marker. If an earlier,
      // partly-failed run already created it, don't pay twice.
      const { data: existing, error: existingError } = await supabase
        .from("room_awards")
        .select("id")
        .eq("room_id", roomId)
        .eq("award_type", "match_winner")
        .contains("metadata", { match_id })
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) continue;

      const { data: award, error: awardError } = await supabase
        .from("room_awards")
        .insert({
          room_id: roomId,
          user_id: winner.user_id,
          award_type: "match_winner",
          points: winner.points_earned,
          metadata: { match_id },
        })
        .select("id")
        .single();
      if (awardError) throw awardError;

      const { error: mpError } = await supabase.rpc("apply_point_transaction", {
        p_user_id: winner.user_id,
        p_amount: ROOM_WIN_BONUS,
        p_reason: "private_room_win",
        p_metadata: { room_id: roomId, match_id },
      });
      if (mpError) {
        await supabase.from("room_awards").delete().eq("id", award.id);
        throw mpError;
      }
      awards++;
    }

    return Response.json({ ok: true, rooms_settled: byRoom.size, awards });
  } catch (err) {
    console.error("[settle-room-match] failed", match_id, err);
    Sentry.captureException(err, { extra: { match_id } });
    await supabase
      .from("settlement_locks")
      .delete()
      .eq("match_id", match_id)
      .eq("kind", "room_match");
    return new Response("room-match settlement failed", { status: 500 });
  }
});
