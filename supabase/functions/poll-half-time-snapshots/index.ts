// Half-time checkpoint poller. Runs every 5 minutes (§6.5).
//
// Fires for matches at kickoff + 45min that haven't captured an HT
// snapshot yet. If the API still shows the first half, only the
// minute is updated and the next tick retries. Once HT/2H/ET/FT/PEN
// is returned, the half-time score is captured from score.halftime
// (not the live score) so the snapshot is exact regardless of when
// the poll happened to tick — per §6.3.

import { supabase, Sentry, normalizeStatus } from '../_shared/clients.ts';
import { checkBudget } from '../_shared/budget-guard.ts';

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY')!;

Deno.serve(async () => {
  const { data: due } = await supabase
    .from('matches')
    .select('id, external_id, kickoff, status')
    .lte('kickoff', new Date(Date.now() - 45 * 60 * 1000).toISOString())
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
  for (const match of pending) {
    const allowed = await checkBudget('api-football');
    if (!allowed) {
      Sentry.captureMessage('api-football budget exhausted (HT poll)', 'warning');
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

      const status = normalizeStatus(fixture.fixture.status.short);

      if (status === 'live' && fixture.fixture.status.short === '1H') {
        // Still first half — just update the minute, retry next tick.
        await supabase.from('matches')
          .update({ minute: fixture.fixture.status.elapsed, status: 'live' })
          .eq('id', match.id);
        continue;
      }

      if (['half_time', 'live', 'full_time'].includes(status)) {
        const { error } = await supabase.from('match_snapshots').insert({
          match_id: match.id,
          checkpoint: 'half_time',
          home_score: fixture.score.halftime.home,
          away_score: fixture.score.halftime.away,
          raw_payload: fixture,
        });
        if (!error) {
          captured++;
          await supabase.from('matches')
            .update({ status: 'half_time', minute: 45 })
            .eq('id', match.id);
          // Half-time market set opens as soon as the snapshot lands —
          // see lib/predictions/open-halftime-markets.ts for the
          // client/RPC that reads match_snapshots to build them.
        }
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { match_id: match.id } });
      continue; // serve stale state, move to next match
    }
  }

  return Response.json({ ok: true, captured });
});
