import type { SupabaseClient } from '@supabase/supabase-js';
import { POINTS } from '@/lib/points/constants';

// Mirrors public.current_season() (0001_init.sql) — used only if the
// RPC call fails, so callers still get a sensible season instead of
// erroring out.
export function fallbackSeason(): string {
  const now = new Date();
  const y = now.getFullYear();
  const month = now.getMonth() + 1; // JS is 0-indexed, SQL extract() is 1-indexed
  return month >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * Current-season MP balance for a user. PRD §11.1 — 10 MP is the
 * starting balance, and a brand-new user has no point_balances row
 * at all until their first transaction, so "no row" reads as 10, not
 * 0 — same rule the home page already applies.
 */
export async function getCurrentBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: seasonData } = await supabase.rpc('current_season');
  const season = (seasonData as string | null) ?? fallbackSeason();

  const { data } = await supabase.from('point_balances').select('balance').eq('user_id', userId).eq('season', season).maybeSingle();

  return data?.balance ?? POINTS.NEW_SIGNUP_BALANCE;
}
