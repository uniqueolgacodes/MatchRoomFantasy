// Shared between poll-fixtures and sync-teams. Both need to turn a
// football-data.org team object into one of our internal team ids
// (arsenal, man_city, nottingham_forest, ...).
//
// The previous approach (poll-fixtures v1-v4) derived the id by
// slugifying the API's team `name` — e.g. "AFC Bournemouth" ->
// "afc_bournemouth". That never matches our seeded id ('bournemouth',
// from 0005_seed_teams.sql), and the same mismatch hits Brighton,
// Wolves, Forest, both Manchester clubs, and more. Every insert then
// fails its foreign-key check against `matches.home_team_id
// references teams(id)`, the upsert loop swallows the error, and
// `poll-fixtures` reports success with 0 rows written — which is
// exactly what was happening here.
//
// Fix: match by TLA (the standard three-letter code — ARS, MCI,
// NFO, ...) against our own `teams.short_name` column, which was
// seeded with exactly those codes. TLAs are stable and unambiguous
// in a way display names aren't. A small alias table covers the
// handful of clubs worth a belt-and-braces fallback if a TLA ever
// comes back unexpected.

import { supabase, Sentry } from './clients.ts';
import { checkFootballDataRateLimit } from './rate-limiter.ts';

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_KEY')!;
const API = 'https://api.football-data.org/v4';

// Fallback only — used when the TLA lookup misses. Keyed by a
// normalized team name/shortName, valued by our internal team id.
const NAME_ALIAS_FALLBACK: Record<string, string> = {
  'afc bournemouth': 'bournemouth',
  bournemouth: 'bournemouth',
  'brighton hove albion': 'brighton',
  brighton: 'brighton',
  'nottingham forest': 'nottingham_forest',
  'wolverhampton wanderers': 'wolves',
  wolves: 'wolves',
  'manchester city': 'man_city',
  'manchester united': 'man_united',
  'newcastle united': 'newcastle',
  'tottenham hotspur': 'tottenham',
  'west ham united': 'west_ham',
  'crystal palace': 'crystal_palace',
  'aston villa': 'aston_villa',
  'leicester city': 'leicester',
  'ipswich town': 'ipswich',
};

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bfc\b/g, '')
    .replace(/&/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** id -> uppercase short_name (TLA), from our own teams table. */
export async function getTeamIdMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('teams').select('id, short_name');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const t of data ?? []) {
    map[String(t.short_name).toUpperCase()] = t.id as string;
  }
  return map;
}

/** Resolves one football-data.org team object to our internal team id, or null if unmatched. */
export function resolveTeamId(
  apiTeam: { tla?: string | null; name?: string | null; shortName?: string | null },
  idMap: Record<string, string>
): string | null {
  const tla = (apiTeam.tla ?? '').toUpperCase();
  if (tla && idMap[tla]) return idMap[tla];

  const candidates = [apiTeam.name, apiTeam.shortName].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const alias = NAME_ALIAS_FALLBACK[normalizeTeamName(candidate)];
    if (alias) return alias;
  }
  return null;
}

/**
 * Backfills crest_url + external_id for every team we can match,
 * via a single call to football-data.org's team list (one request —
 * cheap regardless of how often this runs). Crests don't change
 * mid-season, so callers should only invoke this when something is
 * actually missing rather than on every poll.
 */
export async function syncTeamCrests(): Promise<{ matched: number; unmatched: string[] }> {
  const allowed = await checkFootballDataRateLimit();
  if (!allowed) {
    console.warn('[sync-teams] rate limit reached, skipping this run — self-heals or weekly cron will retry');
    return { matched: 0, unmatched: [] };
  }

  const res = await fetch(`${API}/competitions/PL/teams`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error(`[sync-teams] football-data.org ${res.status}:`, bodyText);
    throw new Error(`football-data.org teams ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  const data = await res.json();

  const idMap = await getTeamIdMap();
  let matched = 0;
  const unmatched: string[] = [];

  for (const team of data.teams ?? []) {
    const internalId = resolveTeamId(team, idMap);
    if (!internalId) {
      unmatched.push(team.name ?? team.tla ?? 'unknown');
      continue;
    }
    const { error } = await supabase
      .from('teams')
      .update({ crest_url: team.crest ?? null, external_id: team.id ?? null })
      .eq('id', internalId);
    if (!error) matched++;
    else Sentry.captureException(error);
  }

  if (unmatched.length > 0) {
    Sentry.captureMessage(`sync-teams: ${unmatched.length} unmatched team(s): ${unmatched.join(', ')}`);
  }

  return { matched, unmatched };
}
