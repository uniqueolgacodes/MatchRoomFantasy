-- Extends place_prediction_stake (0014) to price a stake from the
-- SPECIFIC option/scoreline chosen, not the market's one flat
-- odds_multiplier — this is the other half of the odds rebuild
-- (spawn-virtual-matches now generates real per-option odds; this is
-- what actually makes a stake's payout reflect them).
--
-- Backward compatible by construction, not by special-casing "is
-- this virtual": real matches' predictions.options are still plain
-- strings (e.g. ['home','away','draw']) with no per-element odds,
-- and their correct_score resolution_rule has no odds_table/
-- other_odds keys. Every new lookup below falls through to NULL for
-- that shape, and NULL always falls back to the original
-- v_pred.odds_multiplier — so a real-match stake is computed exactly
-- as it was before this migration, byte-for-byte.

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
  v_odds numeric;
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
    -- Per-scoreline price (virtual matches: resolution_rule.odds_table),
    -- else the "other" bucket price, else the flat fallback (real matches).
    v_odds := coalesce(
      (v_pred.resolution_rule -> 'odds_table' ->> v_answer)::numeric,
      (v_pred.resolution_rule ->> 'other_odds')::numeric,
      v_pred.odds_multiplier
    );
  else
    -- The answer must be one of the market's options; store the
    -- canonical text AND, if this option carries its own price
    -- (virtual matches), that price.
    select o.canon, o.odds into v_answer, v_odds
    from (
      select
        case jsonb_typeof(e)
          when 'string' then e #>> '{}'
          else coalesce(e ->> 'key', e ->> 'value', e ->> 'id')
        end as canon,
        case jsonb_typeof(e)
          when 'object' then (e ->> 'odds')::numeric
          else null
        end as odds
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
    v_odds := coalesce(v_odds, v_pred.odds_multiplier);
  end if;

  -- Safety net: a malformed/missing odds value should never produce
  -- a broken (null, zero, or ≤1) payout multiplier.
  if v_odds is null or v_odds <= 1 then
    v_odds := v_pred.odds_multiplier;
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

  v_payout := floor(v_stake * v_odds);

  -- Raises insufficient_balance if the user can't cover the stake
  v_balance := public.apply_point_transaction(
    v_uid, -v_stake, 'prediction_stake', p_prediction_id,
    jsonb_build_object('room_id', p_room_id));

  -- odds_multiplier stored on the stake row is now the ACTUAL price
  -- this stake was placed at (per-option/per-scoreline for virtual
  -- matches, the flat market price for real ones) — settlement and
  -- My Selections both already read potential_payout/odds_multiplier
  -- straight off this row, so nothing downstream needed to change.
  insert into public.prediction_stakes
    (prediction_id, user_id, room_id, answer, stake, odds_multiplier, potential_payout)
  values
    (p_prediction_id, v_uid, p_room_id, v_answer, v_stake, v_odds, v_payout)
  returning * into v_row;

  return jsonb_build_object('stake', to_jsonb(v_row), 'balance', v_balance);
end;
$$;

revoke all on function public.place_prediction_stake(uuid, text, integer, uuid) from public, anon;
grant execute on function public.place_prediction_stake(uuid, text, integer, uuid) to authenticated;
