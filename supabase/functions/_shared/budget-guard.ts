// Per-day request budget guard for API-Football.
// PRD v5 §6.7 — the checkpoint model itself is what makes the budget
// stretch across a matchday; this guard is a hard stop against runaway
// bugs (a scheduling loop double-firing, a manual re-run gone wrong),
// not the primary rationing mechanism.

import { Redis } from 'https://esm.sh/@upstash/redis@1';

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_TOKEN')!,
});

const DAILY_LIMIT = 90; // headroom under API-Football's 100/day free tier

export async function checkBudget(key: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const counterKey = `budget:${key}:${today}`;
  const used = await redis.incr(counterKey);
  if (used === 1) {
    await redis.expire(counterKey, 60 * 60 * 26); // ~26h, clears past midnight UTC
  }
  return used <= DAILY_LIMIT;
}
