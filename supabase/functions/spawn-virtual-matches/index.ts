// Spawns the next set of 2 virtual matches, 3 hours ahead of kickoff.
// Runs every 20 minutes — see the cadence comment further down for
// why that stays slot-aligned.
//
// ODDS REBUILD (was: 4 fixed constants shared by every match, one
// flat odds_multiplier per market so e.g. home/draw/away all paid
// the same). Player feedback: no team-strength variety, no per-
// option pricing, correct_score not "spicy", and — reasonably — a
// worry that if odds ever did vary, always favoring the lower odds
// would just become a learnable "cheat code".
//
// Fix, in one sentence: each match gets its own randomly-drawn pair
// of expected-goals values (a standard football analytics model —
// same math real bookmakers use, not exotic), and every market's
// odds are mathematically derived from that, per option. The
// anti-cheat-code property isn't a rule bolted on top — it falls out
// of the model honestly: the two expected-goals numbers are redrawn
// completely fresh every single match, independent of which
// fictional club it is, so there's no persistent "always-favorite"
// team to learn. And critically, the ACTUAL final score is a
// SEPARATE random draw from that same distribution (see
// samplePoisson below) — the odds describe true probabilities, but
// nothing about them determines or leaks the outcome. A favorite
// wins more often across many matches, exactly as it should, but
// never predictably in any one match.
//
// Zero external API calls, same as before — this is pure math run
// inside the function, no new dependency, no new cost.
import { supabase, Sentry } from '../_shared/clients.ts';

const SLOT_MINUTES = 20;
const LEAD_HOURS = 3;
const TICK_COUNT = 8;
const MATCH_DURATION_SECONDS = 10 * 60;

// --- Probability model ------------------------------------------------

const GOAL_CAP = 6; // grid covers 0-6 goals each side; anything wilder falls into the "other" bucket
const MARGIN = 0.08; // house margin — same spirit as real-match odds being conservative, not razor-thin

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPMF(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** True Poisson-distributed random sample (Knuth's algorithm) — this is what actually decides the match, separately from the odds math below. */
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Random expected-goals value for one team in one match, redrawn every time — this is what keeps every match's odds genuinely different and un-learnable. */
function randomLambda(): number {
  return 0.5 + Math.random() * 2.1; // ~0.5 (weak night) to ~2.6 (strong night)
}

function probToOdds(p: number, min = 1.2, max = 50): number {
  if (p <= 0) return max;
  const raw = 1 / (p * (1 + MARGIN));
  return Math.round(Math.min(max, Math.max(min, raw)) * 10) / 10;
}

interface ScoreGrid {
  grid: number[][]; // grid[home][away] = probability of that exact scoreline
  otherProb: number; // probability mass for anything outside the 0-6/0-6 grid
}

function buildScoreGrid(lambdaHome: number, lambdaAway: number): ScoreGrid {
  const grid: number[][] = [];
  let total = 0;
  for (let i = 0; i <= GOAL_CAP; i++) {
    grid[i] = [];
    for (let j = 0; j <= GOAL_CAP; j++) {
      const p = poissonPMF(i, lambdaHome) * poissonPMF(j, lambdaAway);
      grid[i][j] = p;
      total += p;
    }
  }
  return { grid, otherProb: Math.max(0, 1 - total) };
}

interface MarketProbabilities {
  pHome: number;
  pDraw: number;
  pAway: number;
  pBtts: number;
  pOver: number;
  pUnder: number;
  pHomeCleanSheet: number;
  pAwayCleanSheet: number;
}

function aggregateMarkets({ grid, otherProb }: ScoreGrid, lambdaHome: number, lambdaAway: number): MarketProbabilities {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pBtts = 0;
  let pOver = 0;
  let pHomeCleanSheet = 0;
  let pAwayCleanSheet = 0;

  for (let i = 0; i <= GOAL_CAP; i++) {
    for (let j = 0; j <= GOAL_CAP; j++) {
      const p = grid[i][j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;

      if (i >= 1 && j >= 1) pBtts += p;
      if (i + j >= 3) pOver += p;
      if (j === 0) pHomeCleanSheet += p;
      if (i === 0) pAwayCleanSheet += p;
    }
  }

  // The "other" bucket (>6 goals either side) is rare with this
  // lambda range but not impossible — fold it in as a reasonable
  // approximation rather than ignoring it and letting probabilities
  // fail to sum to 1: it's always over 2.5, almost always BTTS, and
  // favors whichever side has the higher expected goals.
  pOver += otherProb;
  pBtts += otherProb * 0.9;
  if (lambdaHome >= lambdaAway) pHome += otherProb;
  else pAway += otherProb;

  return { pHome, pDraw, pAway, pBtts, pOver, pUnder: 1 - pOver, pHomeCleanSheet, pAwayCleanSheet };
}

function buildCorrectScoreOddsTable(grid: number[][]): Record<string, number> {
  const table: Record<string, number> = {};
  for (let i = 0; i <= GOAL_CAP; i++) {
    for (let j = 0; j <= GOAL_CAP; j++) {
      table[`${i}-${j}`] = probToOdds(grid[i][j], 1.5, 75);
    }
  }
  return table;
}

// --- Match script (events, not odds) -----------------------------------

const FLAVOR_WEIGHTS: [string, number][] = [
  ['near_miss', 30],
  ['big_save', 22],
  ['corner', 22],
  ['yellow_card', 18],
  ['var_check', 6],
  ['red_card', 2],
];

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

/**
 * Builds the 8-tick event script for a match whose final score
 * (homeGoals, awayGoals) has already been drawn. Goal ticks are
 * placed to match that score exactly; any remaining ticks (up to 8
 * total) are flavor events (saves, corners, cards, near misses) with
 * no bearing on the score, purely for the live ticker.
 */
function buildScript(homeGoals: number, awayGoals: number): { tick: number; offset_seconds: number; type: string; team: 'home' | 'away' }[] {
  const events: { type: string; team: 'home' | 'away' }[] = [];
  for (let i = 0; i < homeGoals; i++) events.push({ type: 'goal', team: 'home' });
  for (let i = 0; i < awayGoals; i++) events.push({ type: 'goal', team: 'away' });

  const flavorCount = Math.max(0, TICK_COUNT - events.length);
  for (let i = 0; i < flavorCount; i++) {
    events.push({ type: weightedPick(FLAVOR_WEIGHTS), team: Math.random() < 0.5 ? 'home' : 'away' });
  }

  shuffle(events); // interleave goals and flavor unpredictably before assigning times

  const offsets = events
    .map(() => 50 + Math.random() * (MATCH_DURATION_SECONDS - 90))
    .sort((a, b) => a - b);

  return events.map((e, i) => ({ tick: i, offset_seconds: Math.round(offsets[i]), type: e.type, team: e.team }));
}

// --- Spawn ---------------------------------------------------------------

Deno.serve(async () => {
  try {
    const now = new Date();
    const targetKickoff = new Date(now);
    targetKickoff.setUTCHours(targetKickoff.getUTCHours() + LEAD_HOURS);
    // Minutes deliberately NOT zeroed — cron guarantees `now` lands
    // on :00/:20/:40, and +3 hours preserves that (180 is a multiple
    // of 20), so the target is already slot-aligned. Rounding down
    // defensively in case this ever runs off-schedule.
    targetKickoff.setUTCMinutes(Math.floor(targetKickoff.getUTCMinutes() / SLOT_MINUTES) * SLOT_MINUTES, 0, 0);

    const { data: alreadySpawned } = await supabase
      .from('matches')
      .select('id')
      .eq('is_virtual', true)
      .eq('kickoff', targetKickoff.toISOString())
      .limit(1);

    if (alreadySpawned && alreadySpawned.length > 0) {
      return Response.json({ ok: true, skipped: 'already spawned for this slot' });
    }

    const { data: allTeams, error: teamsError } = await supabase.from('teams').select('id').eq('is_virtual', true);
    if (teamsError || !allTeams || allTeams.length < 4) {
      throw new Error(`virtual team roster unavailable or too small: ${teamsError?.message ?? allTeams?.length}`);
    }

    const { data: recent } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id')
      .eq('is_virtual', true)
      .order('kickoff', { ascending: false })
      .limit(2);

    const recentTeamIds = new Set((recent ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]));
    let candidates = allTeams.map((t) => t.id).filter((id) => !recentTeamIds.has(id));
    if (candidates.length < 4) candidates = allTeams.map((t) => t.id);

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

      // The odds model, fresh for this match:
      const lambdaHome = randomLambda() + 0.15; // small home-advantage nudge, not enough to make it predictable on its own
      const lambdaAway = randomLambda();
      const scoreGrid = buildScoreGrid(lambdaHome, lambdaAway);
      const markets = aggregateMarkets(scoreGrid, lambdaHome, lambdaAway);
      const correctScoreOdds = buildCorrectScoreOddsTable(scoreGrid.grid);
      const otherScoreOdds = probToOdds(scoreGrid.otherProb, 20, 75);

      // The actual result — an independent random draw from the same
      // distribution the odds above were computed from. Not derived
      // from the odds, not the "favorite always wins" shortcut.
      let homeGoals = samplePoisson(lambdaHome);
      let awayGoals = samplePoisson(lambdaAway);
      if (homeGoals + awayGoals > 7) {
        const scale = 7 / (homeGoals + awayGoals);
        homeGoals = Math.round(homeGoals * scale);
        awayGoals = Math.min(7 - homeGoals, Math.round(awayGoals * scale));
      }

      const script = buildScript(homeGoals, awayGoals);

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

      await openVirtualPreMatchMarkets(match.id, targetKickoff.toISOString(), markets, correctScoreOdds, otherScoreOdds);
      spawned++;
    }

    return Response.json({ ok: true, spawned, kickoff: targetKickoff.toISOString() });
  } catch (err) {
    console.error('[spawn-virtual-matches] fatal error:', err);
    Sentry.captureException(err);
    return new Response('spawn-virtual-matches failed', { status: 500 });
  }
});

async function openVirtualPreMatchMarkets(
  matchId: string,
  locksAt: string,
  markets: MarketProbabilities,
  correctScoreOdds: Record<string, number>,
  otherScoreOdds: number
) {
  const oddsHome = probToOdds(markets.pHome);
  const oddsDraw = probToOdds(markets.pDraw);
  const oddsAway = probToOdds(markets.pAway);
  const oddsBttsYes = probToOdds(markets.pBtts);
  const oddsBttsNo = probToOdds(1 - markets.pBtts);
  const oddsOver = probToOdds(markets.pOver);
  const oddsUnder = probToOdds(markets.pUnder);
  const oddsHomeCSYes = probToOdds(markets.pHomeCleanSheet);
  const oddsHomeCSNo = probToOdds(1 - markets.pHomeCleanSheet);
  const oddsAwayCSYes = probToOdds(markets.pAwayCleanSheet);
  const oddsAwayCSNo = probToOdds(1 - markets.pAwayCleanSheet);

  const rows = [
    {
      match_id: matchId, phase: 'pre_match', category: 'match_winner',
      question: 'Who wins the match?',
      options: [
        { key: 'home', label: 'Home Win', odds: oddsHome },
        { key: 'draw', label: 'Draw', odds: oddsDraw },
        { key: 'away', label: 'Away Win', odds: oddsAway },
      ],
      odds_multiplier: oddsHome, // legacy fallback column — unused while options carry their own odds, kept populated for safety
      locks_at: locksAt,
      resolution_rule: { type: 'match_winner' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'both_teams_score',
      question: 'Will both teams score?',
      options: [
        { key: 'yes', label: 'Yes', odds: oddsBttsYes },
        { key: 'no', label: 'No', odds: oddsBttsNo },
      ],
      odds_multiplier: oddsBttsYes,
      locks_at: locksAt,
      resolution_rule: { type: 'both_teams_score' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'over_under',
      question: 'Total goals: over or under 2.5?',
      options: [
        { key: 'over', label: 'Over 2.5', odds: oddsOver },
        { key: 'under', label: 'Under 2.5', odds: oddsUnder },
      ],
      odds_multiplier: oddsOver,
      locks_at: locksAt,
      resolution_rule: { type: 'over_under', line: 2.5 },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'clean_sheet',
      question: 'Will the home team keep a clean sheet?',
      options: [
        { key: 'yes', label: 'Yes', odds: oddsHomeCSYes },
        { key: 'no', label: 'No', odds: oddsHomeCSNo },
      ],
      odds_multiplier: oddsHomeCSYes,
      locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'home' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'clean_sheet',
      question: 'Will the away team keep a clean sheet?',
      options: [
        { key: 'yes', label: 'Yes', odds: oddsAwayCSYes },
        { key: 'no', label: 'No', odds: oddsAwayCSNo },
      ],
      odds_multiplier: oddsAwayCSYes,
      locks_at: locksAt,
      resolution_rule: { type: 'clean_sheet', team: 'away' },
    },
    {
      match_id: matchId, phase: 'pre_match', category: 'correct_score',
      question: 'Predict the exact final score.',
      options: [],
      odds_multiplier: otherScoreOdds, // fallback only — real per-scoreline odds live in resolution_rule.odds_table
      locks_at: locksAt,
      resolution_rule: { type: 'correct_score', odds_table: correctScoreOdds, other_odds: otherScoreOdds },
    },
  ];

  const { error } = await supabase.from('predictions').insert(rows);
  if (error) {
    console.error('[spawn-virtual-matches] failed to open markets for match', matchId, error);
    Sentry.captureException(error, { extra: { match_id: matchId } });
  }
}
