// Fantasy League scoring. PRD v5 §17.4/§22.
// Independent of prediction settlement — runs on the same FT trigger
// but has no dependency on settle-predictions, so it's fired in
// parallel rather than chained (see §17.5 for the ordering diagram).

import { supabase, Sentry } from '../_shared/clients.ts';

const SCORING = {
  playing60: 2, playingUnder60: 1,
  goalGK: 6, goalDEF: 6, goalMID: 5, goalFWD: 4,
  assist: 3,
  cleanSheetGKDEF: 4, cleanSheetMID: 1,
  savesPerPoint: 3,
  penaltySave: 5, penaltyMiss: -2,
  yellow: -1, red: -3, ownGoal: -2,
};

Deno.serve(async (req) => {
  const { match_id } = await req.json();

  const { data: lock } = await supabase
    .from('settlement_locks')
    .insert({ match_id, kind: 'gameweek' })
    .select('match_id')
    .maybeSingle();

  if (!lock) {
    return Response.json({ ok: true, skipped: 'already settled' });
  }

  try {
    const { data: match } = await supabase.from('matches').select('*').eq('id', match_id).single();
    if (!match || match.status !== 'full_time') throw new Error('match not confirmed full-time');

    const { data: events } = await supabase.from('match_events').select('*').eq('match_id', match_id);

    const { data: picks } = await supabase
      .from('fantasy_picks')
      .select('*')
      .in('team_id', [match.home_team_id, match.away_team_id]);

    for (const pick of picks ?? []) {
      let points = SCORING.playing60; // simplified: assumes played 60+ min

      const conceded = pick.team_id === match.home_team_id ? match.away_score : match.home_score;
      if (conceded === 0 && ['GK', 'DEF', 'MID'].includes(pick.position)) {
        points += pick.position === 'MID' ? SCORING.cleanSheetMID : SCORING.cleanSheetGKDEF;
      }

      for (const ev of events ?? []) {
        if (ev.player_name !== pick.player_name) continue;
        if (ev.type === 'goal' || ev.type === 'penalty_scored') {
          points += pick.position === 'GK' || pick.position === 'DEF' ? SCORING.goalGK
            : pick.position === 'MID' ? SCORING.goalMID : SCORING.goalFWD;
        }
        if (ev.type === 'own_goal') points += SCORING.ownGoal;
        if (ev.type === 'yellow_card') points += SCORING.yellow;
        if (ev.type === 'red_card') points += SCORING.red;
        if (ev.type === 'penalty_missed') points += SCORING.penaltyMiss;
      }

      if (pick.is_captain) points *= 2;

      await supabase.from('fantasy_picks').update({ points }).eq('id', pick.id);
    }

    return Response.json({ ok: true, picks_scored: (picks ?? []).length });
  } catch (err) {
    Sentry.captureException(err, { extra: { match_id } });
    await supabase.from('settlement_locks').delete().eq('match_id', match_id).eq('kind', 'gameweek');
    return new Response('gameweek scoring failed', { status: 500 });
  }
});
