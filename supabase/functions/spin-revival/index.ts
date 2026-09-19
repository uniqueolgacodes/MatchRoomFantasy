// Revival Roulette. PRD §11.
// Called by the client when the user requests a spin. Validates
// eligibility server-side (never trust a client-computed check) and
// applies the outcome atomically via apply_point_transaction.

import { supabase, Sentry } from '../_shared/clients.ts';

const WHEEL = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5];
const REVIVAL_THRESHOLD = 1;
const REVIVAL_COOLDOWN_MINUTES = 15;
const MIN_ACCOUNT_AGE_DAYS = 7;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    const { data: userData, error: authErr } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    );
    if (authErr || !userData.user) return new Response('unauthorized', { status: 401 });
    const userId = userData.user.id;

    const { data: season } = await supabase.rpc('current_season');
    const [{ data: balance }, { data: lastSpin }, { data: profile }] = await Promise.all([
      supabase.from('point_balances').select('balance').eq('user_id', userId).eq('season', season).maybeSingle(),
      supabase.from('revival_spins').select('spun_at').eq('user_id', userId).order('spun_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('created_at').eq('id', userId).single(),
    ]);

    if ((balance?.balance ?? 0) >= REVIVAL_THRESHOLD) {
      return Response.json({ eligible: false, reason: 'Balance too high' }, { status: 400 });
    }
    const ageDays = (Date.now() - new Date(profile!.created_at).getTime()) / 86_400_000;
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      return Response.json({ eligible: false, reason: 'Account too new' }, { status: 400 });
    }
    if (lastSpin) {
      const nextEligible = new Date(lastSpin.spun_at).getTime() + REVIVAL_COOLDOWN_MINUTES * 60_000;
      if (Date.now() < nextEligible) {
        return Response.json({ eligible: false, reason: 'Cooldown', nextSpinAt: new Date(nextEligible).toISOString() }, { status: 400 });
      }
    }

    const outcome = WHEEL[Math.floor(Math.random() * WHEEL.length)];
    const balanceBefore = balance?.balance ?? 0;

    await supabase.rpc('apply_point_transaction', {
      p_user_id: userId, p_amount: outcome, p_reason: 'revival_win',
      p_metadata: { wheel_outcome: outcome },
    });
    await supabase.from('revival_spins').insert({
      user_id: userId, season, outcome,
      balance_before: balanceBefore, balance_after: balanceBefore + outcome,
    });

    return Response.json({ ok: true, outcome });
  } catch (err) {
    Sentry.captureException(err);
    return new Response('spin-revival failed', { status: 500 });
  }
});
