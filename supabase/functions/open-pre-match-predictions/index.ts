// Opens pre-match predictions for upcoming fixtures. PRD §15.2.
//
// This function didn't exist before this change — settle-predictions
// could resolve prediction rows, but nothing anywhere created them,
// so there was nothing for a user to actually predict on regardless
// of how well the settlement pipeline worked.
//
// Zero football-data.org calls — this only reads `matches` (already
// populated by poll-fixtures) and writes `predictions`, so it costs
// nothing against the rate limit and can run as often as makes
// sense. Scheduled every 6 hours, right alongside poll-fixtures.
//
// Markets generated: match winner, both teams to score, over/under
// 2.5 goals, clean sheet (per team), correct score. Cards and
// corners are deliberately NOT generated — football-data.org's free
// tier doesn't return that data, so those markets would always void
// at settlement. Half-time markets (second-half winner, HT/FT combo)
// are NOT generated here either — they're created by
// poll-half-time-snapshots at the moment the half-time snapshot
// lands, since they only make sense once that data exists.

import { supabase, Sentry } from '../_shared/clients.ts';

const LOOKAHEAD_DAYS = 14; // matches poll-fixtures' own fixture window

Deno.serve(async () => {
  const now = new Date();
  const lookaheadEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const { data: upcoming, error: matchesError } = await supabase
    .from('matches')
    .select('id, kickoff, home_team_id, away_team_id')
    .eq('status', 'scheduled')
    .eq('is_virtual', false)
    .gte('kickoff', now.toISOString())
    .lte('kickoff', lookaheadEnd.toISOString());

  if (matchesError) {
    console.error('[open-pre-match-predictions] failed to fetch upcoming matches:', matchesError);
    Sentry.captureException(matchesError);
    return new Response('failed to fetch matches', { status: 500 });
  }

  if (!upcoming || upcoming.length === 0) {
    return Response.json({ ok: true, opened: 0 });
  }

  // Skip matches that already have pre-match predictions — they're
  // always created as one batch, so checking for any one row is
  // enough to know the whole batch exists.
  const { data: existing } = await supabase
    .from('predictions')
    .select('match_id')
    .eq('phase', 'pre_match')
    .in('match_id', upcoming.map((m) => m.id));
  const alreadyOpened = new Set((existing ?? []).map((r) => r.match_id));
  const pending = upcoming.filter((m) => !alreadyOpened.has(m.id));

  let opened = 0;
  for (const match of pending) {
    const rows = buildPreMatchCatalog(match.id, match.kickoff);
    const { error } = await supabase.from('predictions').insert(rows);
    if (!error) {
      opened++;
    } else {
      console.error('[open-pre-match-predictions] failed to open predictions for match', match.id, error);
      Sentry.captureException(error, { extra: { match_id: match.id } });
    }
  }

  return Response.json({ ok: true, opened, skipped: upcoming.length - pending.length });
});

function buildPreMatchCatalog(matchId: string, kickoff: string) {
  const locksAt = kickoff; // lock_expired_predictions (pg_cron, every minute) flips status at this timestamp

  return [
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'match_winner',
      question: 'Who wins the match?',
      options: ['home', 'away', 'draw'],
      odds_multiplier: 1.5,
      locks_at: locksAt,
      resolution_rule: { type: 'match_winner' },
    },
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'both_teams_score',
      question: 'Will both teams score?',
      options: ['yes', 'no'],
      odds_multiplier: 1.8,
      locks_at: locksAt,
      resolution_rule: { type: 'both_teams_score' },
    },
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'over_under',
      question: 'Total goals: over or under 2.5?',
      options: ['over', 'under'],
      odds_multiplier: 1.8,
      locks_at: locksAt,
      resolution_rule: { type: 'over_under', line: 2.5 },
    },
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'clean_sheet',
      question: 'Will the home team keep a clean sheet?',
      options: ['yes', 'no'],
      odds_multiplier: 2.0,
      locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'home' },
    },
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'clean_sheet',
      question: 'Will the away team keep a clean sheet?',
      options: ['yes', 'no'],
      odds_multiplier: 2.0,
      locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'away' },
    },
    {
      match_id: matchId,
      phase: 'pre_match',
      category: 'correct_score',
      question: 'Predict the exact final score.',
      options: [], // free-text guess, validated client-side as "N-N"
      odds_multiplier: 3.0,
      locks_at: locksAt,
      resolution_rule: { type: 'correct_score' },
    },
  ];
}
