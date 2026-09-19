// Full-time checkpoint poller. Runs every 5 minutes (§6.5).
//
// Fires for matches at kickoff + 90min that haven't reached full_time
// yet. Retries every tick until FT/AET/PEN is confirmed. On capture,
// also attempts a statistics call for cards/corners — if that call
// fails, the FT snapshot is still written with null card/corner
// values and the affected markets void at settlement rather than
// blocking the whole match from settling (§6.3).
//
// Inserting the full_time row fires the on_full_time_snapshot trigger
// (§6.6 / migration 0001), which kicks off score-gameweek and
// settle-predictions.

import { supabase, Sentry, normalizeStatus } from '../_shared/clients.ts';
import { checkBudget } from '../_shared/budget-guard.ts';

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY')!;

Deno.serve(async () => {
  const { data: due } = await supabase
    .from('matches')
    .select('id, external_id, kickoff, status')
    .lte('kickoff', new Date(Date.now() - 90 * 60 * 1000).toISOString())
    .neq('status', 'full_time')
    .in('status', ['scheduled', 'live', 'half_time']);

  if (!due || due.length === 0) {
    return Response.json({ ok: true, skipped: 'none due' });
  }

  let captured = 0;
  for (const match of due) {
    const allowed = await checkBudget('api-football');
    if (!allowed) {
      Sentry.captureMessage('api-football budget exhausted (FT poll)', 'warning');
      break;
    }

    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?id=${match.external_id}`,
        { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
      );
      if (!res.ok) throw new Error(`API-Football ${res.status}`);
      const json = await res.json();
      const fixture = json.response?.[0];
      if (!fixture) continue;

      const shortStatus = fixture.fixture.status.short;
      const isFinished = ['FT', 'AET', 'PEN'].includes(shortStatus);

      if (!isFinished) {
        // Not done yet — update minute/status, retry next tick.
        await supabase.from('matches')
          .update({ minute: fixture.fixture.status.elapsed, status: normalizeStatus(shortStatus) })
          .eq('id', match.id);
        continue;
      }

      // Attempt the statistics call for cards/corners. A failure here
      // doesn't block the FT snapshot — it just leaves those two
      // fields null, and the affected markets void at settlement.
      let cards: { home: number | null; away: number | null } = { home: null, away: null };
      let corners: { home: number | null; away: number | null } = { home: null, away: null };
      try {
        const statsAllowed = await checkBudget('api-football');
        if (statsAllowed) {
          const statsRes = await fetch(
            `https://v3.football.api-sports.io/fixtures/statistics?fixture=${match.external_id}`,
            { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
          );
          if (statsRes.ok) {
            const statsJson = await statsRes.json();
            const parsed = parseCardsAndCorners(statsJson.response, match.external_id);
            cards = parsed.cards;
            corners = parsed.corners;
          }
        }
      } catch (statsErr) {
        Sentry.captureException(statsErr, { extra: { match_id: match.id, phase: 'stats-call' } });
      }

      const { error } = await supabase.from('match_snapshots').insert({
        match_id: match.id,
        checkpoint: 'full_time',
        home_score: fixture.goals.home,
        away_score: fixture.goals.away,
        home_cards: cards.home,
        away_cards: cards.away,
        home_corners: corners.home,
        away_corners: corners.away,
        raw_payload: fixture,
      });

      if (!error) {
        captured++;
        await supabase.from('matches')
          .update({ status: 'full_time', home_score: fixture.goals.home, away_score: fixture.goals.away })
          .eq('id', match.id);
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { match_id: match.id } });
      continue;
    }
  }

  return Response.json({ ok: true, captured });
});

function parseCardsAndCorners(statsResponse: any[], externalId: number) {
  // API-Football returns one block per team with a "statistics" array
  // of { type, value } pairs — shape may need adjusting once tested
  // against real fixture IDs.
  const result = {
    cards: { home: null as number | null, away: null as number | null },
    corners: { home: null as number | null, away: null as number | null },
  };
  if (!Array.isArray(statsResponse) || statsResponse.length < 2) return result;

  const [homeTeam, awayTeam] = statsResponse;
  const extract = (stats: any[], type: string) => {
    const found = stats?.find((s: any) => s.type === type);
    return found ? Number(found.value) || 0 : null;
  };

  const homeYellow = extract(homeTeam.statistics, 'Yellow Cards') ?? 0;
  const homeRed = extract(homeTeam.statistics, 'Red Cards') ?? 0;
  const awayYellow = extract(awayTeam.statistics, 'Yellow Cards') ?? 0;
  const awayRed = extract(awayTeam.statistics, 'Red Cards') ?? 0;

  result.cards.home = homeYellow + homeRed;
  result.cards.away = awayYellow + awayRed;
  result.corners.home = extract(homeTeam.statistics, 'Corner Kicks');
  result.corners.away = extract(awayTeam.statistics, 'Corner Kicks');

  return result;
}
