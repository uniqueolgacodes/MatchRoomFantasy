// Shared rate limiter for football-data.org, enforced across EVERY
// function that calls that API (poll-fixtures, poll-half-time-
// snapshots, poll-full-time-snapshots, syncTeamCrests). This is the
// actual fix for "stay within the limit" — football-data.org's free
// tier allows 10 requests/minute, and the realistic worst case (a
// handful of matches all near a checkpoint in the same tick) sits
// comfortably under that on its own, but nothing was previously
// stopping several functions from landing in the same minute and
// stacking past it together. This closes that gap without changing
// the 5-minute poll cadence itself.
//
// Approach: a fixed 60-second bucket keyed by the current minute
// (UTC), capped at 8 — two below the real limit of 10, as a safety
// margin for clock skew between this and football-data.org's own
// window, and to leave headroom for a manual test call from the
// dashboard without tipping something over. Every caller checks in
// before making a request; a false result means "skip this call,
// retry next tick" — every caller already tolerates that (it's the
// same graceful-retry pattern the checkpoint pollers use for
// "not finished yet").

import { Redis } from 'https://esm.sh/@upstash/redis@1';

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_TOKEN')!,
});

const PER_MINUTE_LIMIT = 8; // real limit is 10/min — this leaves margin

export async function checkFootballDataRateLimit(): Promise<boolean> {
  const bucket = new Date().toISOString().slice(0, 16); // e.g. "2026-09-21T14:05"
  const key = `ratelimit:football-data:${bucket}`;
  const used = await redis.incr(key);
  if (used === 1) {
    await redis.expire(key, 90); // bucket key outlives its own minute, then GC'd
  }
  return used <= PER_MINUTE_LIMIT;
}
