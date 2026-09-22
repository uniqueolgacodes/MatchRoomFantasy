// Advances every live/scheduled-and-due virtual match by one tick.
// Runs every minute. Zero external API calls — reads/writes only
// matches, match_events, and match_snapshots.
//
// At minute 15, writing the full_time match_snapshots row fires the
// existing on_full_time_snapshot trigger — settlement (settle-
// predictions, settle-room-match, score-gameweek) then runs exactly
// as it does for a real match, via code that already exists and
// hasn't needed a single change for this to work.
//
// Bug fixed here: home_score/away_score on `matches` were only ever
// written in the full-time branch at the bottom, never during the
// live minutes. match_events rows were still inserted live (which is
// why LiveMatchCard's event ticker updated correctly — it listens
// for match_events INSERTs directly), but nothing was pushing an
// UPDATE to `matches` with the new score in between, so the
// scoreline itself sat frozen at 0-0 until the match actually ended.
// Fix: tally goal-type match_events for this match on every tick
// (not just the final one) and write that tally to `matches` every
// time — the exact same "count actual goal events, one source of
// truth" approach the full-time branch already used, just now run
// continuously instead of once at the end. LiveMatchCard already
// listens for `matches` UPDATEs and was always ready for this; it
// just never received one mid-match.

import { supabase, Sentry } from '../_shared/clients.ts';

const MATCH_DURATION_SECONDS = 15 * 60;

interface ScriptTick {
  tick: number;
  offset_seconds: number;
  type: string;
  team: 'home' | 'away';
}

Deno.serve(async () => {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, kickoff, status, home_team_id, away_team_id, virtual_script')
    .eq('is_virtual', true)
    .in('status', ['scheduled', 'live']);

  if (error) {
    console.error('[advance-virtual-matches] failed to fetch matches:', error);
    Sentry.captureException(error);
    return new Response('failed to fetch virtual matches', { status: 500 });
  }

  if (!matches || matches.length === 0) {
    return Response.json({ ok: true, processed: 0 });
  }

  const now = Date.now();
  let advanced = 0;
  let settled = 0;

  for (const match of matches) {
    const kickoffMs = new Date(match.kickoff).getTime();
    const elapsedSeconds = Math.floor((now - kickoffMs) / 1000);

    if (elapsedSeconds < 0) continue; // not kicked off yet, nothing to do

    try {
      if (match.status === 'scheduled') {
        await supabase.from('matches').update({ status: 'live', minute: 0 }).eq('id', match.id);
      }

      const script = (match.virtual_script ?? []) as ScriptTick[];
      const dueTicks = script.filter((t) => elapsedSeconds >= t.offset_seconds);

      for (const t of dueTicks) {
        const teamId = t.team === 'home' ? match.home_team_id : match.away_team_id;
        const { error: insertError } = await supabase.from('match_events').insert({
          match_id: match.id,
          type: t.type,
          minute: Math.min(15, Math.floor(t.offset_seconds / 60)),
          team_id: teamId,
          external_event_id: `virtual:${match.id}:${t.tick}`,
        });
        // 23505 = unique_violation — this tick was already inserted
        // by an earlier invocation. Expected and harmless; anything
        // else is worth knowing about.
        if (insertError && insertError.code !== '23505') {
          console.error('[advance-virtual-matches] event insert failed', match.id, t.tick, insertError);
          Sentry.captureException(insertError, { extra: { match_id: match.id, tick: t.tick } });
        }
      }

      // Live score tally, recomputed every tick (not just at
      // full-time) from the actual match_events rows — same single
      // source of truth the settlement branch below uses, just now
      // kept in sync with `matches` continuously so the scoreline
      // updates in real time instead of jumping from 0-0 straight to
      // the final score only once the match ends.
      const { data: goalEvents } = await supabase
        .from('match_events')
        .select('team_id')
        .eq('match_id', match.id)
        .eq('type', 'goal');

      const homeScore = (goalEvents ?? []).filter((e) => e.team_id === match.home_team_id).length;
      const awayScore = (goalEvents ?? []).filter((e) => e.team_id === match.away_team_id).length;

      const minuteDisplay = Math.min(15, Math.floor(elapsedSeconds / 60));
      await supabase.from('matches').update({ minute: minuteDisplay, home_score: homeScore, away_score: awayScore }).eq('id', match.id);
      if (dueTicks.length > 0) advanced++;

      if (elapsedSeconds >= MATCH_DURATION_SECONDS) {
        const { error: snapshotError } = await supabase.from('match_snapshots').insert({
          match_id: match.id,
          checkpoint: 'full_time',
          home_score: homeScore,
          away_score: awayScore,
        });

        if (!snapshotError) {
          await supabase.from('matches')
            .update({ status: 'full_time', home_score: homeScore, away_score: awayScore, minute: 15 })
            .eq('id', match.id);
          settled++;
        } else if (snapshotError.code !== '23505') {
          console.error('[advance-virtual-matches] full-time snapshot failed', match.id, snapshotError);
          Sentry.captureException(snapshotError, { extra: { match_id: match.id } });
        }
      }
    } catch (err) {
      console.error('[advance-virtual-matches] error processing match', match.id, err);
      Sentry.captureException(err, { extra: { match_id: match.id } });
      continue;
    }
  }

  return Response.json({ ok: true, processed: matches.length, advanced, settled });
});
