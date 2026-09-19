// Settles all open/locked predictions for a match once the full-time
// snapshot lands. PRD v5 §17.2.
//
// Reads/writes prediction_stakes (the per-user table), not predictions
// (the match-level market table) — this was the critical bug in the
// v4.0 draft, fixed here.

import { supabase, Sentry } from '../_shared/clients.ts';

Deno.serve(async (req) => {
  const { match_id } = await req.json();

  // 1. Idempotency claim (§17.1). Zero rows affected means another
  // invocation already claimed this match — exit immediately.
  const { data: lock, error: lockErr } = await supabase
    .from('settlement_locks')
    .insert({ match_id, kind: 'predictions' })
    .select('match_id')
    .maybeSingle();

  if (lockErr || !lock) {
    return Response.json({ ok: true, skipped: 'already settled' });
  }

  try {
    // 2. Fetch both snapshots. FT is required, HT is optional (some
    // markets only need FT; half-time markets need both).
    const { data: snapshots } = await supabase
      .from('match_snapshots')
      .select('checkpoint, home_score, away_score, home_cards, away_cards, home_corners, away_corners')
      .eq('match_id', match_id)
      .in('checkpoint', ['half_time', 'full_time']);

    const ft = snapshots?.find((s) => s.checkpoint === 'full_time');
    const ht = snapshots?.find((s) => s.checkpoint === 'half_time');
    if (!ft) throw new Error('no full-time snapshot found — cannot settle');

    // 3. Fetch all open/locked predictions for this match.
    const { data: predictions } = await supabase
      .from('predictions')
      .select('id, category, resolution_rule')
      .eq('match_id', match_id)
      .in('status', ['open', 'locked']);

    if (!predictions || predictions.length === 0) {
      return Response.json({ ok: true, settled: 0 });
    }

    // 4. Evaluate each prediction against the snapshots.
    const settledOutcomes: { id: string; outcome: string | null; voided: boolean }[] = [];
    for (const p of predictions) {
      const result = evaluateResolutionRule(p.resolution_rule, ft, ht);
      settledOutcomes.push({ id: p.id, outcome: result.outcome, voided: result.voided });

      await supabase.from('predictions')
        .update({
          status: result.voided ? 'voided' : 'settled',
          settled_at: new Date().toISOString(),
          correct_outcome: result.outcome,
        })
        .eq('id', p.id);
    }

    // 5. Fetch every unsettled stake for the predictions just resolved.
    const { data: stakes } = await supabase
      .from('prediction_stakes')
      .select('id, prediction_id, user_id, answer, stake, potential_payout')
      .in('prediction_id', predictions.map((p) => p.id))
      .is('is_correct', null);

    if (!stakes || stakes.length === 0) {
      return Response.json({ ok: true, settled: 0 });
    }

    // 6. Build the awards payload for the atomic batch RPC.
    const outcomeMap = new Map(settledOutcomes.map((o) => [o.id, o]));
    const awards = stakes.map((s) => {
      const resolved = outcomeMap.get(s.prediction_id)!;
      const correct = !resolved.voided && s.answer === resolved.outcome;
      const mp_change = resolved.voided ? s.stake : correct ? s.potential_payout : 0;
      return { prediction_id: s.prediction_id, user_id: s.user_id, correct, mp_change };
    });

    // 7. Atomic batch settlement — all rows update, or none do.
    const { error: rpcErr } = await supabase.rpc('settle_predictions_batch', {
      p_match_id: match_id,
      p_awards: awards,
    });
    if (rpcErr) throw rpcErr;

    // 8. Chain to settle-room-match now that stakes.is_correct is set.
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/settle-room-match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ match_id }),
    });

    return Response.json({ ok: true, settled: awards.length });
  } catch (err) {
    Sentry.captureException(err, { extra: { match_id } });
    // Release the lock so a retry is possible after investigation.
    await supabase.from('settlement_locks').delete().eq('match_id', match_id).eq('kind', 'predictions');
    return new Response('settlement failed', { status: 500 });
  }
});

// Evaluates a prediction's resolution_rule (jsonb) against the two
// snapshots. This is intentionally a thin dispatcher — one case per
// market category from §15.3/§15.4. Extend as markets are added.
function evaluateResolutionRule(
  rule: any,
  ft: { home_score: number; away_score: number; home_cards: number | null; away_cards: number | null; home_corners: number | null; away_corners: number | null },
  ht: { home_score: number; away_score: number } | undefined
): { outcome: string | null; voided: boolean } {
  switch (rule?.type) {
    case 'match_winner':
      return { outcome: ft.home_score > ft.away_score ? 'home' : ft.home_score < ft.away_score ? 'away' : 'draw', voided: false };

    case 'both_teams_score':
      return { outcome: ft.home_score > 0 && ft.away_score > 0 ? 'yes' : 'no', voided: false };

    case 'over_under':
      return { outcome: ft.home_score + ft.away_score > (rule.line ?? 2.5) ? 'over' : 'under', voided: false };

    case 'clean_sheet':
      return { outcome: (rule.team === 'home' ? ft.away_score : ft.home_score) === 0 ? 'yes' : 'no', voided: false };

    case 'correct_score':
      return { outcome: `${ft.home_score}-${ft.away_score}`, voided: false };

    case 'cards_over_under':
      if (ft.home_cards == null || ft.away_cards == null) return { outcome: null, voided: true };
      return { outcome: ft.home_cards + ft.away_cards > (rule.line ?? 4.5) ? 'over' : 'under', voided: false };

    case 'corners_over_under':
      if (ft.home_corners == null || ft.away_corners == null) return { outcome: null, voided: true };
      return { outcome: ft.home_corners + ft.away_corners > (rule.line ?? 10.5) ? 'over' : 'under', voided: false };

    case 'second_half_winner':
      if (!ht) return { outcome: null, voided: true };
      { const h2h = ft.home_score - ht.home_score, h2a = ft.away_score - ht.away_score;
        return { outcome: h2h > h2a ? 'home' : h2h < h2a ? 'away' : 'draw', voided: false }; }

    case 'ht_ft_combo':
      if (!ht) return { outcome: null, voided: true };
      { const htRes = ht.home_score > ht.away_score ? 'home' : ht.home_score < ht.away_score ? 'away' : 'draw';
        const ftRes = ft.home_score > ft.away_score ? 'home' : ft.home_score < ft.away_score ? 'away' : 'draw';
        return { outcome: `${htRes}/${ftRes}`, voided: false }; }

    default:
      // Manual/unrecognized rule — leave for admin handling rather
      // than guessing.
      return { outcome: null, voided: true };
  }
}
