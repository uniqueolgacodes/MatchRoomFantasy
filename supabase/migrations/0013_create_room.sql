-- Room creation RPC, for the "create a room for an upcoming match"
-- flow (PRD §10.1 Public Match Room / Private Match Room).
--
-- 0009's "authenticated users create rooms" policy already lets
-- clients INSERT into `rooms` directly for season_league/community
-- rooms with no match attached. But linking a room to one specific
-- match also needs a `room_matches` row, and clients have no grant
-- to write that table (0009 only gave it a SELECT policy) — by that
-- migration's own stated rule, "anything that touches ... rooms
-- membership ... goes through a SECURITY DEFINER function or the
-- service role." This is that function: it creates the room and its
-- room_matches link in one transaction, so there's never a
-- half-created match room with no match attached.
--
-- Scope: only match_public and private — the two room types the
-- "create a room" UI actually offers. season_league/community room
-- creation still goes through 0009's direct client-insert grant.

create or replace function public.create_room(
  p_name text,
  p_room_type public.room_type,
  p_match_id uuid,
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
  v_match_exists boolean;
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

  select exists(select 1 from public.matches where id = p_match_id) into v_match_exists;
  if not v_match_exists then
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

  insert into public.room_matches (room_id, match_id) values (v_room.id, p_match_id);

  -- No explicit room_members insert here: rooms_add_owner_member
  -- (0009) is a plain AFTER INSERT trigger on `rooms`, so it already
  -- fires for this insert regardless of who/what issued it, and adds
  -- the owner as a member on its own.

  return jsonb_build_object(
    'id', v_room.id, 'slug', v_room.slug, 'room_code', v_room.room_code,
    'name', v_room.name, 'room_type', v_room.room_type
  );
end;
$$;

revoke all on function public.create_room(text, public.room_type, uuid, text) from public, anon;
grant execute on function public.create_room(text, public.room_type, uuid, text) to authenticated;
