-- Fixes place_prediction_stake() (0009) for the correct_score market.
--
-- That market is created with `options: []` (open-pre-match-
-- predictions) — it's meant to be a free-text "N-N" guess, not a
-- fixed option list (its own comment says so: "free-text guess,
-- validated client-side as N-N"). But place_prediction_stake()
-- validates every answer against predictions.options via
-- jsonb_array_elements(). An empty options array produces zero rows
-- to match against, so v_answer stayed NULL and every correct_score
-- stake failed with invalid_answer regardless of what was submitted
-- — the market was unstakeable no matter what the client sent.
--
-- Found this while building the prediction UI on top of it, not
-- something you did wrong — just an easy thing to miss without a UI
-- calling it yet.
--
-- Fix: branch on category. correct_score now validates against a
-- plain "N-N" regex (1-2 digit scores) instead of the options list.
-- Every other market's validation is byte-for-byte unchanged from
-- 0009.

create or replace function public.place_prediction_stake(
  p_prediction_id uuid,
  p_answer text,
  p_stake integer,
  p_room_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pred public.predictions%rowtype;
  v_room public.rooms%rowtype;
  v_stake integer;
  v_answer text;
  v_payout integer;
  v_balance integer;
  v_row public.prediction_stakes%rowtype;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;
  if p_stake is null then
    raise exception 'invalid_stake';
  end if;
  -- PRD 11.1 / 15.9: clamp to [1, 20]
  v_stake := least(20, greatest(1, p_stake));

  select * into v_pred from public.predictions where id = p_prediction_id;
  if not found then
    raise exception 'prediction_not_found';
  end if;
  if v_pred.status <> 'open' or v_pred.locks_at <= now() or v_pred.opens_at > now() then
    raise exception 'prediction_closed';
  end if;

  if v_pred.category = 'correct_score' then
    if trim(coalesce(p_answer, '')) !~ '^[0-9]{1,2}-[0-9]{1,2}$' then
      raise exception 'invalid_answer';
    end if;
    v_answer := trim(p_answer);
  else
    -- The answer must be one of the market's options; store the canonical text.
    select o.canon into v_answer
    from (
      select case jsonb_typeof(e)
               when 'string' then e #>> '{}'
               else coalesce(e ->> 'key', e ->> 'value', e ->> 'id')
             end as canon
      from jsonb_array_elements(
             case when jsonb_typeof(v_pred.options) = 'array'
                  then v_pred.options else '[]'::jsonb end
           ) e
    ) o
    where lower(o.canon) = lower(trim(coalesce(p_answer, '')))
    limit 1;
    if v_answer is null then
      raise exception 'invalid_answer';
    end if;
  end if;

  -- Room context: caller must be a member and the room must cover this match
  if p_room_id is not null then
    select * into v_room from public.rooms where id = p_room_id;
    if not found or v_room.is_archived then
      raise exception 'room_not_available';
    end if;
    if not exists (select 1 from public.room_members
                   where room_id = p_room_id and user_id = v_uid) then
      raise exception 'not_a_member';
    end if;
    if not exists (select 1 from public.room_matches
                   where room_id = p_room_id and match_id = v_pred.match_id) then
      raise exception 'room_not_available';
    end if;
  end if;

  if exists (
    select 1 from public.prediction_stakes
    where prediction_id = p_prediction_id and user_id = v_uid
      and room_id is not distinct from p_room_id
  ) then
    raise exception 'already_predicted';
  end if;

  v_payout := floor(v_stake * v_pred.odds_multiplier);

  -- Raises insufficient_balance if the user can't cover the stake
  v_balance := public.apply_point_transaction(
    v_uid, -v_stake, 'prediction_stake', p_prediction_id,
    jsonb_build_object('room_id', p_room_id));

  insert into public.prediction_stakes
    (prediction_id, user_id, room_id, answer, stake, odds_multiplier, potential_payout)
  values
    (p_prediction_id, v_uid, p_room_id, v_answer, v_stake, v_pred.odds_multiplier, v_payout)
  returning * into v_row;

  return jsonb_build_object('stake', to_jsonb(v_row), 'balance', v_balance);
end;
$$;

revoke all on function public.place_prediction_stake(uuid, text, integer, uuid) from public, anon;
grant execute on function public.place_prediction_stake(uuid, text, integer, uuid) to authenticated;
