// Full-time checkpoint poller. Runs every 5 minutes (§6.5).
//
// Source: football-data.org — see poll-half-time-snapshots/index.ts
// for why API-Football was dropped (season restriction + a wrong-id
// bug, both fixed by switching providers rather than patching them).
//
// One real trade-off from this switch: football-data.org's free tier
// doesn't include cards, corners, or lineups (confirmed, current
// policy) — so home_cards/away_cards/home_corners/away_corners are
// always null here, not attempted. The settlement engine
// (settle-predictions) already voids a market when its resolution
// data is missing, so cards/corners predictions will always void
// rather than resolve. Worth deciding whether to drop those two
// market types from the prediction catalog entirely, since a market
// that can never settle isn't a great thing to show as available.
//
// Fires for matches at kickoff + 90min that haven't reached
// full_time yet. Retries every tick until FINISHED is confirmed.
// Inserting the full_time row fires the on_full_time_snapshot
// trigger (§6.6 / migration 0001), which kicks off score-gameweek
// and settle-predictions.

import { supabase, Sentry, normalizeFootballDataStatus } from '../_shared/clients.ts';
import { checkFootballDataRateLimit } from '../_shared/rate-limiter.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;

Deno.serve(async () => {
  const { data: due } = await supabase
    .from('matches')
    .select('id, external_id, kickoff, status')
    .lte('kickoff', new Date(Date.now() - 90 * 60 * 1000).toISOString())
    .neq('status', 'full_time')
    .eq('is_virtual', false)
    .in('status', ['scheduled', 'live', 'half_time']);

  if (!due || due.length === 0) {
    return Response.json({ ok: true, skipped: 'none due' });
  }

  let captured = 0;
  let rateLimited = 0;

  for (const match of due) {
    const allowed = await checkFootballDataRateLimit();
    if (!allowed) {
      rateLimited++;
      console.warn(`[poll-full-time-snapshots] rate limit reached, deferring match ${match.id} to next tick`);
      continue;
    }

    try {
      const res = await fetch(`https://api.football-data.org/v4/matches/${match.external_id}`, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error(`[poll-full-time-snapshots] football-data.org ${res.status}:`, bodyText);
        throw new Error(`football-data.org ${res.status}: ${bodyText.slice(0, 300)}`);
      }
      const fixture = await res.json();
      const status = normalizeFootballDataStatus(fixture.status);

      if (status !== 'full_time') {
        // Not done yet — update minute/status, retry next tick.
        await supabase.from('matches')
          .update({ minute: fixture.minute ?? null, status })
          .eq('id', match.id);
        continue;
      }

      const ftHome = fixture.score?.fullTime?.home ?? null;
      const ftAway = fixture.score?.fullTime?.away ?? null;
      if (ftHome === null || ftAway === null) {
        // FINISHED but score not populated yet (rare, but the free
        // tier's "delayed" scores mean this can lag by a tick) —
        // retry next cycle rather than writing an incomplete snapshot.
        console.warn(`[poll-full-time-snapshots] match ${match.id} FINISHED but score.fullTime missing, retrying`);
        continue;
      }

      const { error } = await supabase.from('match_snapshots').insert({
        match_id: match.id,
        checkpoint: 'full_time',
        home_score: ftHome,
        away_score: ftAway,
        home_cards: null,
        away_cards: null,
        home_corners: null,
        away_corners: null,
        raw_payload: fixture,
      });

      if (!error) {
        captured++;
        await supabase.from('matches')
          .update({ status: 'full_time', home_score: ftHome, away_score: ftAway })
          .eq('id', match.id);
      } else {
        console.error('[poll-full-time-snapshots] insert failed for match', match.id, error);
        Sentry.captureException(error, { extra: { match_id: match.id } });
      }
    } catch (err) {
      console.error('[poll-full-time-snapshots] error for match', match.id, err);
      Sentry.captureException(err, { extra: { match_id: match.id } });
      continue;
    }
  }

  return Response.json({ ok: true, captured, rateLimited });
});
