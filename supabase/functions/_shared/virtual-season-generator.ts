// supabase/functions/_shared/virtual-season-generator.ts

/**
 * Generates dynamic team strengths for a new season.
 * Simulates a realistic league table by grouping the 20 teams into tiers.
 */
export function generateTeamStrengths(
  teamIds: string[],
): Record<string, number> {
  // Shuffle the teams so the "big 4" changes every season!
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const strengths: Record<string, number> = {};

  shuffled.forEach((teamId, index) => {
    let strength = 1.0;

    if (index < 4) {
      // Tier 1: Title Contenders (Base expected goals: 1.5 to 2.1)
      strength = 1.5 + Math.random() * 0.6;
    } else if (index < 14) {
      // Tier 2: Mid-Table (Base expected goals: 1.0 to 1.5)
      strength = 1.0 + Math.random() * 0.5;
    } else {
      // Tier 3: Relegation Battlers (Base expected goals: 0.6 to 1.0)
      strength = 0.6 + Math.random() * 0.4;
    }

    // Round to 2 decimal places
    strengths[teamId] = Math.round(strength * 100) / 100;
  });

  return strengths;
}

/**
 * The Circle Method Round-Robin Generator.
 * Generates a perfect 380-match schedule for 20 teams.
 * Every team plays every other team exactly twice (home and away).
 */
export function generateSchedule(teamIds: string[]) {
  if (teamIds.length !== 20) {
    throw new Error("Virtual league requires exactly 20 teams.");
  }

  const n = teamIds.length;
  const schedule: { matchday: number; home: string; away: string }[] = [];

  const rotatingTeams = [...teamIds];
  const fixedTeam = rotatingTeams.shift()!; // Remove the first team and fix it in place

  // --- First Half of the Season (Matchdays 1-19) ---
  for (let round = 0; round < n - 1; round++) {
    const matchday = round + 1;

    // 1. The fixed team plays the last team in the rotating array
    if (round % 2 === 0) {
      schedule.push({ matchday, home: fixedTeam, away: rotatingTeams[n - 2] });
    } else {
      schedule.push({ matchday, home: rotatingTeams[n - 2], away: fixedTeam });
    }

    // 2. Pair up the remaining 18 teams
    for (let i = 0; i < n / 2 - 1; i++) {
      const home = rotatingTeams[i];
      const away = rotatingTeams[n - 3 - i];

      if (round % 2 === 0) {
        schedule.push({ matchday, home, away });
      } else {
        schedule.push({ matchday, home: away, away: home });
      }
    }

    // 3. Rotate the array clockwise (pop from end, unshift to start)
    rotatingTeams.unshift(rotatingTeams.pop()!);
  }

  // --- Second Half of the Season (Matchdays 20-38) ---
  const firstHalf = [...schedule];
  for (const match of firstHalf) {
    schedule.push({
      matchday: match.matchday + 19,
      home: match.away,
      away: match.home,
    });
  }

  return schedule;
}
