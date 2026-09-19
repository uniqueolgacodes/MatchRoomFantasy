// Fixture + standings poller. Runs every 6 hours (§6.5 cron schedule).
// Does NOT update match status — status is driven exclusively by the
// checkpoint snapshot pollers (poll-half-time-snapshots,
// poll-full-time-snapshots). This function's only job is to keep
// upcoming fixtures, kickoff times, and team metadata current.

import { supabase, Sentry } from '../_shared/clients.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;
const API = 'https://api.football-data.org/v4';

Deno.serve(async () => {
  try {
    const res = await fetch(`${API}/matches?competitions=PL`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    if (!res.ok) throw new Error(`football-data.org ${res.status}`);
    const data = await res.json();

    let upserted = 0;
    for (const m of data.matches ?? []) {
      const { error } = await supabase.from('matches').upsert(
        {
          external_id: m.id,
          league_id: 'epl',
          season: `${m.season.startDate.slice(0, 4)}-${parseInt(m.season.startDate.slice(0, 4)) + 1}`,
          matchday: m.matchday,
          home_team_id: slugify(m.homeTeam.name),
          away_team_id: slugify(m.awayTeam.name),
          kickoff: m.utcDate,
          venue: m.venue ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'external_id', ignoreDuplicates: false }
      );
      if (!error) upserted++;
    }

    return Response.json({ ok: true, upserted });
  } catch (err) {
    Sentry.captureException(err);
    return new Response('poll-fixtures failed', { status: 500 });
  }
});

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}
