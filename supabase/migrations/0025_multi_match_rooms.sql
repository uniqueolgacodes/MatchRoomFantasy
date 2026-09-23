-- Extends create_room() (0013) to link a room to SEVERAL matches,
-- not just one — "create a room for today's whole slate" instead of
-- being forced into one match at a time. room_matches was always a
-- many-to-many join table (PRD §8.3), so nothing in the schema
-- needed to change — only the RPC's single p_match_id parameter did.
--
-- rooms/[id]/page.tsx already loops over every match linked to a
-- room and renders its own PredictionsBoard per match — that was
-- deliberately built to handle "a room with several linked matches"
-- even though only single-match rooms existed until now, so it needs
-- no changes at all.
--
-- room_type stays restricted to match_public/private, same as
-- before — a day-room is NOT given room_type = 'season_league',
-- specifically because populate_season_room_matches() auto-attaches
-- EVERY future match to every season_league room. A day-room using
-- that type would silently keep growing to cover matches far beyond
-- the day it was created for.

create or replace function public.create_room(
  p_name text,
  p_room_type public.room_type,
  p_match_ids uuid[],
  p_description text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_slug text;
  v_code text;
  v_visibility public.room_visibility;
  v_match_count integer;
  v_match_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if p_room_type not in ('match_public', 'private') then
    raise exception 'invalid_room_type';
  end if;
  v_visibility := case when p_room_type = 'match_public' then 'public' else 'private' end;

  if p_name is null or length(trim(p_name)) < 3 or length(trim(p_name)) > 60 then
    raise exception 'invalid_name';
  end if;

  if p_match_ids is null or array_length(p_match_ids, 1) is null or array_length(p_match_ids, 1) = 0 then
    raise exception 'match_not_found';
  end if;
  if array_length(p_match_ids, 1) > 20 then
    raise exception 'invalid_room_type'; -- reuses an existing client-facing message; not worth a dedicated code for a defensive upper bound
  end if;

  select count(*) into v_match_count from public.matches where id = any(p_match_ids);
  if v_match_count <> array_length(p_match_ids, 1) then
    raise exception 'match_not_found';
  end if;

  v_code := public.generate_room_code();
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || lower(v_code);

  insert into public.rooms (
    slug, room_code, name, description, owner_id, visibility, room_type, is_listed
  ) values (
    v_slug, v_code, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
    v_uid, v_visibility, p_room_type, (v_visibility = 'public')
  ) returning * into v_room;

  foreach v_match_id in array p_match_ids loop
    insert into public.room_matches (room_id, match_id) values (v_room.id, v_match_id)
    on conflict do nothing;
  end loop;

  -- No explicit room_members insert here: rooms_add_owner_member
  -- (0009) is a plain AFTER INSERT trigger on `rooms`, so it already
  -- fires for this insert regardless of who/what issued it, and adds
  -- the owner as a member on its own.

  return jsonb_build_object(
    'id', v_room.id, 'slug', v_room.slug, 'room_code', v_room.room_code,
    'name', v_room.name, 'room_type', v_room.room_type, 'match_count', array_length(p_match_ids, 1)
  );
end;
$$;

-- Drop the old single-match signature — the route/UI always call the
-- array form now, and leaving both around risks the client
-- accidentally calling the stale one.
drop function if exists public.create_room(text, public.room_type, uuid, text);

revoke all on function public.create_room(text, public.room_type, uuid[], text) from public, anon;
grant execute on function public.create_room(text, public.room_type, uuid[], text) to authenticated;
