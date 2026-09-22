// Spawns the next set of 2 virtual matches, 3 hours ahead of their
// kickoff. Runs every hour on the hour — since each run schedules
// exactly the hour-mark 3 hours out, and every prior hour's run
// already did the same for its own +3h target, this naturally keeps
// a rolling 3-hour lookahead window populated at all times without
// needing to generate more than one set per run.
//
// Zero external API calls — this is pure database work, so it costs
// nothing against any rate limit or budget.
//
// Markets open here lock at kickoff, same as real matches — no
// in-play virtual markets, by design (a 15-minute match leaves even
// less room for an honestly-settleable in-play window than a real
// one does).

import { supabase, Sentry } from '../_shared/clients.ts';

const TICK_COUNT = 8;
const TICK_OFFSETS = Array.from({ length: TICK_COUNT }, (_, i) => 90 + i * 105); // seconds from kickoff, last at 825s

// Weighted so most matches don't turn into 8-goal thrillers.
const TICK_TYPE_WEIGHTS: [string, number][] = [
  ['goal', 22],
  ['near_miss', 20],
  ['big_save', 15],
  ['corner', 15],
  ['yellow_card', 15],
  ['var_check', 8],
  ['red_card', 5],
];

const VIRTUAL_ODDS = {
  match_winner: 2.2,
  both_teams_score: 2.0,
  over_under: 2.0,
  clean_sheet: 2.5,
  correct_score: 6.0,
};

Deno.serve(async () => {
  try {
    const now = new Date();
    const targetKickoff = new Date(now);
    targetKickoff.setUTCHours(targetKickoff.getUTCHours() + 3, 0, 0, 0);

    // Idempotency: if this hour's set already exists (retry, or a
    // second invocation landed close together), don't spawn twice.
    const { data: alreadySpawned } = await supabase
      .from('matches')
      .select('id')
      .eq('is_virtual', true)
      .eq('kickoff', targetKickoff.toISOString())
      .limit(1);

    if (alreadySpawned && alreadySpawned.length > 0) {
      return Response.json({ ok: true, skipped: 'already spawned for this hour' });
    }

    const { data: allTeams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('is_virtual', true);

    if (teamsError || !allTeams || allTeams.length < 4) {
      throw new Error(`virtual team roster unavailable or too small: ${teamsError?.message ?? allTeams?.length}`);
    }

    // Avoid immediately repeating the last set's 4 teams, when the
    // roster size allows it.
    const { data: recent } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id')
      .eq('is_virtual', true)
      .order('kickoff', { ascending: false })
      .limit(2);

    const recentTeamIds = new Set((recent ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]));
    let candidates = allTeams.map((t) => t.id).filter((id) => !recentTeamIds.has(id));
    if (candidates.length < 4) candidates = allTeams.map((t) => t.id); // roster too small to exclude — allow repeats

    shuffle(candidates);
    const pairs: [string, string][] = [
      [candidates[0], candidates[1]],
      [candidates[2], candidates[3]],
    ];

    let spawned = 0;
    for (const [homeId, awayId] of pairs) {
      const { data: idResult, error: idError } = await supabase.rpc('next_virtual_external_id');
      if (idError || idResult == null) {
        throw new Error(`failed to allocate virtual external_id: ${idError?.message}`);
      }

      const script = TICK_OFFSETS.map((offsetSeconds, i) => ({
        tick: i,
        offset_seconds: offsetSeconds,
        type: weightedPick(TICK_TYPE_WEIGHTS),
        team: Math.random() < 0.5 ? 'home' : 'away',
      }));

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          external_id: idResult,
          league_id: 'virtual',
          season: 'virtual',
          home_team_id: homeId,
          away_team_id: awayId,
          kickoff: targetKickoff.toISOString(),
          status: 'scheduled',
          is_virtual: true,
          venue: 'Virtual Arena',
          virtual_script: script,
        })
        .select('id')
        .single();

      if (matchError || !match) {
        Sentry.captureException(matchError, { extra: { homeId, awayId } });
        console.error('[spawn-virtual-matches] failed to insert match', matchError);
        continue;
      }

      await openVirtualPreMatchMarkets(match.id, targetKickoff.toISOString());
      spawned++;
    }

    return Response.json({ ok: true, spawned, kickoff: targetKickoff.toISOString() });
  } catch (err) {
    console.error('[spawn-virtual-matches] fatal error:', err);
    Sentry.captureException(err);
    return new Response('spawn-virtual-matches failed', { status: 500 });
  }
});

async function openVirtualPreMatchMarkets(matchId: string, locksAt: string) {
  const rows = [
    {
      match_id: matchId, phase: 'pre_match', category: 'match_winner',
      question: 'Who wins the match?', options: ['home', 'away', 'draw'],
      odds_multiplier: VIRTUAL_ODDS.match_winner, locks_at: locksAt,
      resolution_rule: { type: 'match_winner' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'both_teams_score',
      question: 'Will both teams score?', options: ['yes', 'no'],
      odds_multiplier: VIRTUAL_ODDS.both_teams_score, locks_at: locksAt,
      resolution_rule: { type: 'both_teams_score' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'over_under',
      question: 'Total goals: over or under 2.5?', options: ['over', 'under'],
      odds_multiplier: VIRTUAL_ODDS.over_under, locks_at: locksAt,
      resolution_rule: { type: 'over_under', line: 2.5 },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'clean_sheet',
      question: 'Will the home team keep a clean sheet?', options: ['yes', 'no'],
      odds_multiplier: VIRTUAL_ODDS.clean_sheet, locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'home' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'clean_sheet',
      question: 'Will the away team keep a clean sheet?', options: ['yes', 'no'],
      odds_multiplier: VIRTUAL_ODDS.clean_sheet, locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'away' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'correct_score',
      question: 'Predict the exact final score.', options: [],
      odds_multiplier: VIRTUAL_ODDS.correct_score, locks_at: locksAt,
      resolution_rule: { type: 'correct_score' },
    },
  ];

  const { error } = await supabase.from('predictions').insert(rows);
  if (error) {
    console.error('[spawn-virtual-matches] failed to open markets for match', matchId, error);
    Sentry.captureException(error, { extra: { match_id: matchId } });
  }
}

function weightedPick(weights: [string, number][]): string {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of weights) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return weights[weights.length - 1][0];
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
