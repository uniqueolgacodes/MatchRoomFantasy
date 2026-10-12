-- Fixes settlement for users who staked the same market in more than
-- one place (solo AND a room, or two rooms) — which is exactly what
-- room testers do.
--
-- settle_predictions_batch() updated stakes with
--   where prediction_id = X and user_id = Y
-- so one award hit ALL of that user's stakes on the market and every
-- later award overwrote them again. The MP credited was still right
-- (each award credits its own amount), but is_correct and
-- points_awarded on the rows ended up as whatever the LAST award said.
-- A room stake that won could be recorded as lost (or take a different
-- stake's payout), and the room leaderboard is built from those rows.
--
-- Fix: settle-predictions now sends each stake's id and this function
-- updates exactly that row. If an award has no stake_id (the previous
-- version of the edge function during rollout) it falls back to the
-- old behaviour, so deploy order doesn't matter.

create or replace function public.settle_predictions_batch(
  p_match_id uuid,
  p_awards jsonb
) returns void language plpgsql
set search_path = public, pg_temp
as $$
declare
  award jsonb;
begin
  for award in select * from jsonb_array_elements(p_awards) loop
    if award ? 'stake_id' then
      update prediction_stakes
        set is_correct = (award->>'correct')::boolean,
            points_awarded = (award->>'mp_change')::integer,
            settled_at = now()
        where id = (award->>'stake_id')::uuid;
    else
      update prediction_stakes
        set is_correct = (award->>'correct')::boolean,
            points_awarded = (award->>'mp_change')::integer,
            settled_at = now()
        where prediction_id = (award->>'prediction_id')::uuid
          and user_id = (award->>'user_id')::uuid;
    end if;

    if (award->>'mp_change')::integer > 0 then
      perform apply_point_transaction(
        (award->>'user_id')::uuid,
        (award->>'mp_change')::integer,
        'prediction_win',
        (award->>'prediction_id')::uuid,
        jsonb_build_object('match_id', p_match_id)
      );

      insert into notifications (user_id, type, title, body, deep_link, metadata)
      values (
        (award->>'user_id')::uuid, 'win', 'You won!', 'Match Points earned',
        '/match/' || p_match_id,
        jsonb_build_object('mp_amount', (award->>'mp_change')::integer, 'prediction_id', award->>'prediction_id', 'match_id', p_match_id)
      );
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------
-- Repair rows the old logic overwrote. Only stakes where the same user
-- has another stake on the same market can have been affected, so only
-- those are recomputed, from the market's recorded outcome (for
-- correct_score, from the match's final score, because that outcome
-- can't be stored in predictions.correct_outcome). MP balances are NOT
-- touched: credits were always computed per stake and were correct.
-- ------------------------------------------------------------------
update public.prediction_stakes ps
set is_correct = case
      when p.status = 'voided' then null
      when p.category = 'correct_score' then ps.answer = (m.home_score::text || '-' || m.away_score::text)
      else ps.answer = p.correct_outcome::text
    end,
    points_awarded = case
      when p.status = 'voided' then ps.stake
      when p.category = 'correct_score' then
        case when ps.answer = (m.home_score::text || '-' || m.away_score::text) then ps.potential_payout else 0 end
      else
        case when ps.answer = p.correct_outcome::text then ps.potential_payout else 0 end
    end
from public.predictions p
join public.matches m on m.id = p.match_id
where p.id = ps.prediction_id
  and ps.settled_at is not null
  and (
    p.status = 'voided'
    or (p.category = 'correct_score' and m.home_score is not null and m.away_score is not null)
    or (p.category <> 'correct_score' and p.correct_outcome is not null)
  )
  and exists (
    select 1 from public.prediction_stakes o
    where o.prediction_id = ps.prediction_id
      and o.user_id = ps.user_id
      and o.id <> ps.id
  );

-- predictions.correct_outcome is an enum (yes/no/home/away/draw/over/
-- under/voided), so the settle step's update failed for correct_score
-- markets ("2-1" isn't a member) and left them 'locked' forever. The
-- edge function is fixed to skip that column for them; this tidies the
-- existing ones that already have settled stakes.
update public.predictions p
set status = 'settled', settled_at = coalesce(p.settled_at, now())
where p.category = 'correct_score'
  and p.status = 'locked'
  and exists (
    select 1 from public.prediction_stakes ps
    where ps.prediction_id = p.id and ps.settled_at is not null
  );

-- Rebuild room scores from the repaired rows (idempotent upsert).
select public.refresh_room_match_scores(t.match_id)
from (
  select distinct p.match_id
  from public.prediction_stakes ps
  join public.predictions p on p.id = ps.prediction_id
  where ps.room_id is not null and ps.settled_at is not null
) t;/*  */