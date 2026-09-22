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
// Fixture window is now adaptive, not a fixed number of days. A
// fixed 14-day window went blank during the 2026-27 season's new
// "XL" international break (Premier League paused 21 Sep -> 10 Oct,
// 19 days — FIFA merged what used to be separate September and
// October breaks into one this season) — the window simply never
// reached the next matchday, even though the data existed and was
// one more request away. Instead, this rolls forward in
// MAX_CHUNK_DAYS-wide steps (football-data.org's free-tier cap per
// request is 10 days) until it's collected a real matchday's worth
// of fixtures or hits MAX_LOOKAHEAD_DAYS, whichever comes first.
// MAX_LOOKAHEAD_DAYS is sized to clear this season's other breaks
// too (Nov 9-17, Mar 22-30) without manual upkeep each season.
//
// Every step goes through the shared rate limiter
// (_shared/rate-limiter.ts, 8/min budget against football-data.org's
// real 10/min limit) — worst case here is ~4 requests in one run,
// nowhere near that budget, but the limiter is what makes "just keep
// rolling forward" a safe design rather than a way to eventually
// blow the quota during a long enough gap.
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
import { checkFootballDataRateLimit } from '../_shared/rate-limiter.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;
const API = 'https://api.football-data.org/v4';
const MAX_CHUNK_DAYS = 10; // football-data.org free-tier cap per request
const MIN_MATCHES_TARGET = 10; // roughly one full PL matchday — stop rolling forward once we've got at least this many
const MAX_LOOKAHEAD_DAYS = 35; // hard safety cap regardless of target — covers every scheduled 2026-27 break with room to spare

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchMatchesForWindow(from: Date, to: Date): Promise<{ matches: any[]; rateLimited: boolean }> {
  const allowed = await checkFootballDataRateLimit();
  if (!allowed) {
    console.warn('[poll-fixtures] rate limit reached, stopping the roll-forward here — will resume next 6-hour run');
    return { matches: [], rateLimited: true };
  }

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
  return { matches: data.matches ?? [], rateLimited: false };
}

/**
 * Rolls forward from today in MAX_CHUNK_DAYS-wide steps until either
 * MIN_MATCHES_TARGET matches have been collected, the rate limiter
 * says stop, or MAX_LOOKAHEAD_DAYS is reached — whichever comes
 * first. Returns every match found across however many windows that
 * took, plus a bit of bookkeeping for the response/logs.
 */
async function collectUpcomingMatches(): Promise<{ matches: any[]; windowsUsed: number; daysCovered: number; hitCap: boolean }> {
  const start = new Date();
  const hardEnd = new Date(start.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const allMatches: any[] = [];
  let cursor = start;
  let windowsUsed = 0;

  while (allMatches.length < MIN_MATCHES_TARGET && cursor < hardEnd) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000, hardEnd.getTime()));
    const { matches, rateLimited } = await fetchMatchesForWindow(cursor, chunkEnd);
    windowsUsed++;
    if (rateLimited) break;
    allMatches.push(...matches);
    cursor = chunkEnd;
  }

  const daysCovered = Math.round((cursor.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return { matches: allMatches, windowsUsed, daysCovered, hitCap: cursor >= hardEnd };
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

    const { matches: rawMatches, windowsUsed, daysCovered, hitCap } = await collectUpcomingMatches();

    // Chunk boundaries can return the same match twice (dateTo of one
    // window == dateFrom of the next) — dedupe by football-data.org's
    // match id before processing. Harmless either way since the
    // upsert below is keyed on external_id, but no reason to do the
    // work twice.
    const seen = new Set<number>();
    const matches = rawMatches.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    console.log(
      `[poll-fixtures] collected ${matches.length} unique match(es) across ${windowsUsed} window(s), covering ${daysCovered} day(s) ahead${hitCap ? ' (hit the lookahead cap without finding a full matchday — may genuinely be off-season)' : ''}`
    );

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

    console.log(`[poll-fixtures] done. upserted=${upserted} skipped=${skipped.length} failed=${failed.length} daysCovered=${daysCovered}`);
    return Response.json({ ok: true, upserted, skipped: skipped.length, failed, windowsUsed, daysCovered, hitCap });
  } catch (err) {
    console.error('[poll-fixtures] fatal error:', err);
    Sentry.captureException(err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
