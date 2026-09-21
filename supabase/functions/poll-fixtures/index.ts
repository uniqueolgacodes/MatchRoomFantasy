// Fixture + standings poller. Runs every 6 hours (§6.5 cron schedule).
// Does NOT update match status — status is driven exclusively by the
// checkpoint snapshot pollers (poll-half-time-snapshots,
// poll-full-time-snapshots). This function's only job is to keep
// upcoming fixtures, kickoff times, and team metadata current.
//
// Team ids are resolved via resolveTeamId() (TLA match against our
// own teams.short_name, see _shared/teams.ts) instead of slugifying
// the API's display name — see that file's comment for why.
//
// Fixture window: football-data.org's free tier rejects any
// dateFrom/dateTo span over 10 days ("period must not exceed 10
// days"), but the product wants a full 14-day look-ahead. Two
// sequential 10-day-max requests cover 14 days between them — still
// just 2 of football-data.org's 10 requests/minute budget, so this
// costs nothing worth guarding.
//
// Every error path here also console.error()s, in addition to the
// Sentry capture — Sentry needs a configured project/DSN to actually
// show anything, but Dashboard -> Edge Functions -> poll-fixtures ->
// Logs always shows console output, so that's the fastest way to see
// what actually failed. Each match is also processed in its own
// try/catch so one malformed row (e.g. missing season.startDate)
// can't abort the entire run.
import { supabase, Sentry } from '../_shared/clients.ts';
import { getTeamIdMap, resolveTeamId, syncTeamCrests } from '../_shared/teams.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;
const API = 'https://api.football-data.org/v4';
const TOTAL_WINDOW_DAYS = 14; // the product requirement: fixtures up to 2 weeks ahead
const MAX_CHUNK_DAYS = 10; // football-data.org free-tier cap per request

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Splits [now, now+TOTAL_WINDOW_DAYS] into <=MAX_CHUNK_DAYS-wide windows. */
function buildWindows(): Array<{ from: Date; to: Date }> {
  const start = new Date();
  const end = new Date(start.getTime() + TOTAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = start;
  while (cursor < end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000, end.getTime()));
    windows.push({ from: cursor, to: chunkEnd });
    cursor = chunkEnd;
  }
  return windows;
}

async function fetchMatchesForWindow(from: Date, to: Date): Promise<any[]> {
  const params = new URLSearchParams({
    competitions: 'PL',
    dateFrom: toDateParam(from),
    dateTo: toDateParam(to),
  });
  console.log('[poll-fixtures] fetching', `${API}/matches?${params}`);
  const res = await fetch(`${API}/matches?${params}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error(`[poll-fixtures] football-data.org ${res.status}:`, bodyText);
    throw new Error(`football-data.org ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  const data = await res.json();
  console.log('[poll-fixtures] window', toDateParam(from), '->', toDateParam(to), 'returned', data.matches?.length ?? 0, 'matches');
  return data.matches ?? [];
}

Deno.serve(async () => {
  try {
    // Self-healing crest backfill: only fires if some team is still
    // missing crest art (e.g. right after seeding). Crests don't
    // change mid-season, so this is a single extra request on the
    // first run and a no-op query on every run after.
    const { count: missingCrests, error: crestCountError } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .is('crest_url', null);
    if (crestCountError) {
      console.error('[poll-fixtures] crest count query failed:', crestCountError);
      Sentry.captureException(crestCountError);
    }
    if ((missingCrests ?? 0) > 0) {
      await syncTeamCrests().catch((err) => {
        console.error('[poll-fixtures] self-heal crest sync failed:', err);
        Sentry.captureException(err);
      });
    }

    const teamIdMap = await getTeamIdMap();
    if (Object.keys(teamIdMap).length === 0) {
      console.error('[poll-fixtures] teams table returned 0 rows — has 0005_seed_teams.sql been applied?');
    }

    const windows = buildWindows();
    const allMatches: any[] = [];
    for (const w of windows) {
      allMatches.push(...(await fetchMatchesForWindow(w.from, w.to)));
    }
    // Chunk boundaries can return the same match twice (dateTo of one
    // window == dateFrom of the next) — dedupe by football-data.org's
    // match id before processing. Harmless either way since the
    // upsert below is keyed on external_id, but no reason to do the
    // work twice.
    const seen = new Set<number>();
    const matches = allMatches.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    console.log('[poll-fixtures] total unique matches across', windows.length, 'window(s):', matches.length);

    let upserted = 0;
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const m of matches) {
      try {
        const homeId = resolveTeamId(m.homeTeam, teamIdMap);
        const awayId = resolveTeamId(m.awayTeam, teamIdMap);
        if (!homeId || !awayId) {
          skipped.push(`${m.homeTeam?.name ?? '?'} vs ${m.awayTeam?.name ?? '?'} (tla: ${m.homeTeam?.tla}/${m.awayTeam?.tla})`);
          continue;
        }

        const seasonStart = m.season?.startDate?.slice(0, 4);
        const season = seasonStart ? `${seasonStart}-${parseInt(seasonStart) + 1}` : null;

        const { error } = await supabase.from('matches').upsert(
          {
            external_id: m.id,
            league_id: 'epl',
            season,
            matchday: m.matchday ?? null,
            home_team_id: homeId,
            away_team_id: awayId,
            kickoff: m.utcDate,
            venue: m.venue ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'external_id', ignoreDuplicates: false }
        );
        if (!error) {
          upserted++;
        } else {
          console.error('[poll-fixtures] upsert failed for match', m.id, error);
          Sentry.captureException(error);
          failed.push(`${m.id}: ${error.message}`);
        }
      } catch (rowErr) {
        console.error('[poll-fixtures] error processing match', m?.id, rowErr);
        Sentry.captureException(rowErr);
        failed.push(`${m?.id ?? '?'}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
      }
    }

    if (skipped.length > 0) {
      console.warn(`[poll-fixtures] skipped ${skipped.length} unmapped match(es):`, skipped);
      Sentry.captureMessage(`poll-fixtures: skipped ${skipped.length} unmapped match(es): ${skipped.join(', ')}`);
    }

    console.log(`[poll-fixtures] done. upserted=${upserted} skipped=${skipped.length} failed=${failed.length}`);
    return Response.json({ ok: true, upserted, skipped: skipped.length, failed });
  } catch (err) {
    console.error('[poll-fixtures] fatal error:', err);
    Sentry.captureException(err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
