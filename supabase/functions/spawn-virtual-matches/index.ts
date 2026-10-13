// supabase/functions/spawn-virtual-matches/index.ts

import { supabase, Sentry } from "../_shared/clients.ts";
import {
  generateTeamStrengths,
  generateSchedule,
} from "../_shared/virtual-season-generator.ts";

const MATCH_DURATION_SECONDS = 5 * 60; // 5 minute matches
const BETTING_WINDOW_MINUTES = 3; // 3 minutes to bet before kickoff
const TICK_COUNT = 8;
const GOAL_CAP = 6;
const MARGIN = 0.08;

// --- Probability & Scripting Math (Unchanged from original, just tweaked for 5 min) ---
function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function poissonPMF(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0,
    p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
function probToOdds(p: number, min = 1.2, max = 50): number {
  if (p <= 0) return max;
  const raw = 1 / (p * (1 + MARGIN));
  return Math.round(Math.min(max, Math.max(min, raw)) * 10) / 10;
}

function buildScoreGrid(lambdaHome: number, lambdaAway: number) {
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

function aggregateMarkets(
  { grid, otherProb }: ReturnType<typeof buildScoreGrid>,
  lambdaHome: number,
  lambdaAway: number,
) {
  let pHome = 0,
    pDraw = 0,
    pAway = 0,
    pBtts = 0,
    pOver = 0,
    pHomeCleanSheet = 0,
    pAwayCleanSheet = 0;
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
  pOver += otherProb;
  pBtts += otherProb * 0.9;
  if (lambdaHome >= lambdaAway) pHome += otherProb;
  else pAway += otherProb;
  return {
    pHome,
    pDraw,
    pAway,
    pBtts,
    pOver,
    pUnder: 1 - pOver,
    pHomeCleanSheet,
    pAwayCleanSheet,
  };
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

function buildScript(homeGoals: number, awayGoals: number) {
  const events: { type: string; team: "home" | "away" }[] = [];
  for (let i = 0; i < homeGoals; i++)
    events.push({ type: "goal", team: "home" });
  for (let i = 0; i < awayGoals; i++)
    events.push({ type: "goal", team: "away" });

  const FLAVOR_WEIGHTS: [string, number][] = [
    ["near_miss", 30],
    ["big_save", 22],
    ["corner", 22],
    ["yellow_card", 18],
    ["var_check", 6],
    ["red_card", 2],
  ];
  const flavorCount = Math.max(0, TICK_COUNT - events.length);
  for (let i = 0; i < flavorCount; i++) {
    let roll = Math.random() * 100,
      selected = FLAVOR_WEIGHTS[FLAVOR_WEIGHTS.length - 1][0];
    for (const [val, w] of FLAVOR_WEIGHTS) {
      if (roll < w) {
        selected = val;
        break;
      }
      roll -= w;
    }
    events.push({
      type: selected,
      team: Math.random() < 0.5 ? "home" : "away",
    });
  }

  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }

  const offsets = events
    .map(() => 30 + Math.random() * (MATCH_DURATION_SECONDS - 60))
    .sort((a, b) => a - b);
  return events.map((e, i) => ({
    tick: i,
    offset_seconds: Math.round(offsets[i]),
    type: e.type,
    team: e.team,
  }));
}

// --- Dynamic Matchday Spawner --------------------------------------------

Deno.serve(async () => {
  try {
    // 1. Get or Create Active Season
    let { data: season } = await supabase
      .from("virtual_seasons")
      .select("*")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!season) {
      // Create new season
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("is_virtual", true);
      if (!teams || teams.length < 20)
        throw new Error("Need exactly 20 virtual teams in DB");

      const teamIds = teams.map((t) => t.id);
      const strengths = generateTeamStrengths(teamIds);
      const schedule = generateSchedule(teamIds);

      const { data: newSeason } = await supabase
        .from("virtual_seasons")
        .insert({})
        .select("*")
        .single();
      season = newSeason;

      const statsInserts = Object.entries(strengths).map(
        ([team_id, base_strength]) => ({
          season_id: season.id,
          team_id,
          base_strength,
        }),
      );
      await supabase.from("virtual_team_stats").insert(statsInserts);

      const scheduleInserts = schedule.map((s) => ({
        season_id: season.id,
        matchday: s.matchday,
        home_team_id: s.home,
        away_team_id: s.away,
      }));
      await supabase.from("virtual_schedule").insert(scheduleInserts);
    }

    // 2. Determine Next Matchday to Spawn
    const { data: pendingSchedule } = await supabase
      .from("virtual_schedule")
      .select("matchday")
      .eq("season_id", season.id)
      .is("match_id", null)
      .order("matchday", { ascending: true })
      .limit(1);

    if (!pendingSchedule || pendingSchedule.length === 0) {
      // Season over! Mark completed. The next cron run will spawn a new season.
      await supabase
        .from("virtual_seasons")
        .update({ status: "completed" })
        .eq("id", season.id);
      return Response.json({
        ok: true,
        msg: "Season completed, spinning up next season in 8 mins.",
      });
    }

    const nextMatchday = pendingSchedule[0].matchday;

    // Fetch the 10 matches for this matchday
    const { data: fixtures } = await supabase
      .from("virtual_schedule")
      .select("*")
      .eq("season_id", season.id)
      .eq("matchday", nextMatchday);

    if (!fixtures || fixtures.length === 0)
      throw new Error("Schedule corruption");

    // Check if another worker just spawned this
    if (fixtures[0].match_id !== null)
      return Response.json({ ok: true, skipped: "Matchday already spawned" });

    // 3. Fetch Strengths & Form
    const { data: stats } = await supabase
      .from("virtual_team_stats")
      .select("team_id, base_strength")
      .eq("season_id", season.id);
    const baseStrengths = new Map(
      stats?.map((s) => [s.team_id, s.base_strength]),
    );

    // Fetch last 5 matches to calculate Form Modifier
    const { data: recentMatches } = await supabase
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", `Virtual-S${season.season_number}`)
      .eq("status", "full_time")
      .order("kickoff", { ascending: false })
      .limit(100); // Plenty to find last 5 for everyone

    const getFormModifier = (teamId: string) => {
      if (!recentMatches) return 0;
      let formPoints = 0;
      let matchesChecked = 0;
      for (const m of recentMatches) {
        if (matchesChecked >= 5) break;
        if (m.home_team_id === teamId) {
          formPoints +=
            m.home_score > m.away_score
              ? 0.1
              : m.home_score < m.away_score
                ? -0.1
                : 0;
          matchesChecked++;
        } else if (m.away_team_id === teamId) {
          formPoints +=
            m.away_score > m.home_score
              ? 0.1
              : m.away_score < m.home_score
                ? -0.1
                : 0;
          matchesChecked++;
        }
      }
      return formPoints;
    };

    // 4. Calculate Kickoff (Always 3 mins from exactly NOW, to keep the continuous loop tight)
    const now = new Date();
    const targetKickoff = new Date(
      now.getTime() + BETTING_WINDOW_MINUTES * 60000,
    );

    let spawned = 0;
    const matchIdsToLink: { schedId: string; matchId: string }[] = [];

    // 5. Generate and Insert Matches
    for (const fixture of fixtures) {
      const { data: idResult } = await supabase.rpc("next_virtual_external_id");

      const homeBase = baseStrengths.get(fixture.home_team_id) || 1.0;
      const awayBase = baseStrengths.get(fixture.away_team_id) || 1.0;

      // The core model: Base + Form + Home Advantage (0.2)
      const lambdaHome = Math.max(
        0.3,
        homeBase + getFormModifier(fixture.home_team_id) + 0.2,
      );
      const lambdaAway = Math.max(
        0.3,
        awayBase + getFormModifier(fixture.away_team_id),
      );

      const scoreGrid = buildScoreGrid(lambdaHome, lambdaAway);
      const markets = aggregateMarkets(scoreGrid, lambdaHome, lambdaAway);
      const correctScoreOdds = buildCorrectScoreOddsTable(scoreGrid.grid);
      const otherScoreOdds = probToOdds(scoreGrid.otherProb, 20, 75);

      let homeGoals = samplePoisson(lambdaHome);
      let awayGoals = samplePoisson(lambdaAway);
      if (homeGoals + awayGoals > 7) {
        const scale = 7 / (homeGoals + awayGoals);
        homeGoals = Math.round(homeGoals * scale);
        awayGoals = Math.min(7 - homeGoals, Math.round(awayGoals * scale));
      }

      const script = buildScript(homeGoals, awayGoals);

      const { data: match, error: matchError } = await supabase
        .from("matches")
        .insert({
          external_id: idResult,
          league_id: "virtual",
          season: `Virtual-S${season.season_number}`,
          matchday: nextMatchday,
          home_team_id: fixture.home_team_id,
          away_team_id: fixture.away_team_id,
          kickoff: targetKickoff.toISOString(),
          status: "scheduled",
          is_virtual: true,
          venue: "Virtual Arena",
          virtual_script: script,
        })
        .select("id")
        .single();

      if (matchError || !match) continue;

      matchIdsToLink.push({ schedId: fixture.id, matchId: match.id });
      await openVirtualPreMatchMarkets(
        match.id,
        targetKickoff.toISOString(),
        markets,
        correctScoreOdds,
        otherScoreOdds,
      );
      spawned++;
    }

    // 6. Link matches back to schedule and update current matchday
    for (const link of matchIdsToLink) {
      await supabase
        .from("virtual_schedule")
        .update({ match_id: link.matchId })
        .eq("id", link.schedId);
    }
    await supabase
      .from("virtual_seasons")
      .update({ current_matchday: nextMatchday })
      .eq("id", season.id);

    return Response.json({
      ok: true,
      season: season.season_number,
      matchday: nextMatchday,
      spawned,
      kickoff: targetKickoff.toISOString(),
    });
  } catch (err) {
    console.error("[spawn-virtual-matches] error:", err);
    Sentry.captureException(err);
    return new Response("spawn-virtual-matches failed", { status: 500 });
  }
});

async function openVirtualPreMatchMarkets(
  matchId: string,
  locksAt: string,
  markets: ReturnType<typeof aggregateMarkets>,
  correctScoreOdds: Record<string, number>,
  otherScoreOdds: number,
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
      match_id: matchId,
      phase: "pre_match",
      category: "match_winner",
      question: "Who wins the match?",
      options: [
        { key: "home", label: "Home Win", odds: oddsHome },
        { key: "draw", label: "Draw", odds: oddsDraw },
        { key: "away", label: "Away Win", odds: oddsAway },
      ],
      odds_multiplier: oddsHome,
      locks_at: locksAt,
      resolution_rule: { type: "match_winner" },
    },
    {
      match_id: matchId,
      phase: "pre_match",
      category: "both_teams_score",
      question: "Will both teams score?",
      options: [
        { key: "yes", label: "Yes", odds: oddsBttsYes },
        { key: "no", label: "No", odds: oddsBttsNo },
      ],
      odds_multiplier: oddsBttsYes,
      locks_at: locksAt,
      resolution_rule: { type: "both_teams_score" },
    },
    {
      match_id: matchId,
      phase: "pre_match",
      category: "over_under",
      question: "Total goals: over or under 2.5?",
      options: [
        { key: "over", label: "Over 2.5", odds: oddsOver },
        { key: "under", label: "Under 2.5", odds: oddsUnder },
      ],
      odds_multiplier: oddsOver,
      locks_at: locksAt,
      resolution_rule: { type: "over_under", line: 2.5 },
    },
    {
      match_id: matchId,
      phase: "pre_match",
      category: "clean_sheet",
      question: "Home clean sheet?",
      options: [
        { key: "yes", label: "Yes", odds: oddsHomeCSYes },
        { key: "no", label: "No", odds: oddsHomeCSNo },
      ],
      odds_multiplier: oddsHomeCSYes,
      locks_at: locksAt,
      resolution_rule: { type: "clean_sheet", team: "home" },
    },
    {
      match_id: matchId,
      phase: "pre_match",
      category: "clean_sheet",
      question: "Away clean sheet?",
      options: [
        { key: "yes", label: "Yes", odds: oddsAwayCSYes },
        { key: "no", label: "No", odds: oddsAwayCSNo },
      ],
      odds_multiplier: oddsAwayCSYes,
      locks_at: locksAt,
      resolution_rule: { type: "clean_sheet", team: "away" },
    },
    {
      match_id: matchId,
      phase: "pre_match",
      category: "correct_score",
      question: "Exact final score?",
      options: [],
      odds_multiplier: otherScoreOdds,
      locks_at: locksAt,
      resolution_rule: {
        type: "correct_score",
        odds_table: correctScoreOdds,
        other_odds: otherScoreOdds,
      },
    },
  ];

  const { error } = await supabase.from("predictions").insert(rows);
  if (error) {
    console.error("Failed to open markets", matchId, error);
    Sentry.captureException(error);
  }
}
