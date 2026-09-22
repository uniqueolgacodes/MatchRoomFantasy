// Half-time checkpoint poller. Runs every 5 minutes (§6.5).
//
// Source: football-data.org — see the comment history in
// poll-full-time-snapshots/index.ts for why API-Football was dropped
// entirely (season restriction + a wrong-id-namespace bug).
//
// Every call is gated by the shared rate limiter (checkFootballData
// RateLimit), which enforces football-data.org's 10 req/min limit
// across ALL functions that call it, not just this one. A blocked
// call here just means "retry next tick" — the same graceful pattern
// already used for "match hasn't reached half-time yet".
//
// On a successful half-time capture, this ALSO opens the two
// half-time-only prediction markets for that match (second-half
// winner, HT/FT combo) — they're tightly coupled to this exact
// moment, so creating them here (rather than a separate function)
// keeps that coupling explicit. They lock a few minutes after the
// break, per the "a few minutes of grace" design discussed earlier
// — cron timing isn't perfectly precise to the second, so a hard
// zero-second window would be unusable.

import { supabase, Sentry, normalizeFootballDataStatus } from '../_shared/clients.ts';
import { checkFootballDataRateLimit } from '../_shared/rate-limiter.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;
const HALF_TIME_MARKET_WINDOW_MINUTES = 3;

Deno.serve(async () => {
  const { data: due } = await supabase
    .from('matches')
    .select('id, external_id, kickoff, status')
    .lte('kickoff', new Date(Date.now() - 45 * 60 * 1000).toISOString())
    .eq('is_virtual', false)
    .in('status', ['scheduled', 'live']);

  if (!due || due.length === 0) {
    return Response.json({ ok: true, skipped: 'none due' });
  }

  // Skip matches that already have an HT snapshot.
  const { data: existing } = await supabase
    .from('match_snapshots')
    .select('match_id')
    .eq('checkpoint', 'half_time')
    .in('match_id', due.map((m) => m.id));
  const alreadyCaptured = new Set((existing ?? []).map((r) => r.match_id));
  const pending = due.filter((m) => !alreadyCaptured.has(m.id));

  let captured = 0;
  let rateLimited = 0;

  for (const match of pending) {
    const allowed = await checkFootballDataRateLimit();
    if (!allowed) {
      rateLimited++;
      console.warn(`[poll-half-time-snapshots] rate limit reached, deferring match ${match.id} to next tick`);
      continue;
    }

    try {
      const res = await fetch(`https://api.football-data.org/v4/matches/${match.external_id}`, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error(`[poll-half-time-snapshots] football-data.org ${res.status}:`, bodyText);
        throw new Error(`football-data.org ${res.status}: ${bodyText.slice(0, 300)}`);
      }
      const fixture = await res.json();
      const status = normalizeFootballDataStatus(fixture.status);

      if (status === 'live') {
        await supabase.from('matches')
          .update({ minute: fixture.minute ?? null, status: 'live' })
          .eq('id', match.id);
        continue;
      }

      if (['half_time', 'full_time'].includes(status)) {
        const htHome = fixture.score?.halfTime?.home ?? fixture.score?.halftime?.home ?? null;
        const htAway = fixture.score?.halfTime?.away ?? fixture.score?.halftime?.away ?? null;
        if (htHome === null || htAway === null) {
          console.warn(`[poll-half-time-snapshots] match ${match.id} past HT but score.halfTime missing, retrying`);
          continue;
        }

        const { error } = await supabase.from('match_snapshots').insert({
          match_id: match.id,
          checkpoint: 'half_time',
          home_score: htHome,
          away_score: htAway,
          raw_payload: fixture,
        });

        if (!error) {
          captured++;
          await supabase.from('matches')
            .update({ status: 'half_time', minute: 45 })
            .eq('id', match.id);
          await openHalfTimeMarkets(match.id);
        } else {
          console.error('[poll-half-time-snapshots] insert failed for match', match.id, error);
          Sentry.captureException(error, { extra: { match_id: match.id } });
        }
      }
    } catch (err) {
      console.error('[poll-half-time-snapshots] error for match', match.id, err);
      Sentry.captureException(err, { extra: { match_id: match.id } });
      continue;
    }
  }

  return Response.json({ ok: true, captured, rateLimited });
});

async function openHalfTimeMarkets(matchId: string) {
  const locksAt = new Date(Date.now() + HALF_TIME_MARKET_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from('predictions').insert([
    {
      match_id: matchId,
      phase: 'half_time',
      category: 'second_half_winner',
      question: 'Who wins the second half?',
      options: ['home', 'away', 'draw'],
      odds_multiplier: 2.0,
      locks_at: locksAt,
      resolution_rule: { type: 'second_half_winner' },
    },
    {
      match_id: matchId,
      phase: 'half_time',
      category: 'ht_ft_combo',
      question: 'Correct half-time/full-time result?',
      options: ['home/home', 'home/draw', 'home/away', 'draw/home', 'draw/draw', 'draw/away', 'away/home', 'away/draw', 'away/away'],
      odds_multiplier: 4.0,
      locks_at: locksAt,
      resolution_rule: { type: 'ht_ft_combo' },
    },
  ]);

  if (error) {
    console.error('[poll-half-time-snapshots] failed to open half-time markets for match', matchId, error);
    Sentry.captureException(error, { extra: { match_id: matchId, phase: 'open-half-time-markets' } });
  }
}
