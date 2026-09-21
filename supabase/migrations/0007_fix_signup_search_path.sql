-- Fixes the "relation profiles/rooms does not exist" error on
-- signup. Root cause: generate_referral_code(), generate_room_code(),
-- and handle_new_user() (0001_init.sql) reference `profiles` /
-- `rooms` / `room_members` without a schema prefix, and rely on the
-- session's search_path to include `public`.
--
-- That's true for most Postgres sessions (the API roles Supabase
-- creates typically do), but the trigger that creates a profile row
-- fires from auth.users, invoked by the `supabase_auth_admin` role
-- during GoTrue's signup flow — and that role's search_path does not
-- include `public`. handle_new_user() itself is fine (its one write
-- to profiles is schema-qualified), but it calls
-- public.generate_referral_code() inline as part of that same insert,
-- and that function's unqualified `from profiles` fails to resolve —
-- which aborts the whole insert.
--
-- Fix: schema-qualify every table reference in the functions on this
-- call path, and pin `search_path` explicitly so this class of bug
-- can't resurface if a different role ends up calling these later.

create or replace function public.generate_room_code()
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_exists boolean;
  i integer;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.rooms where room_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function public.generate_referral_code()
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    select exists(select 1 from public.profiles where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function public.touch_last_seen(p_user_id uuid)
returns void language sql security definer
set search_path = public, pg_temp as $$
  update public.profiles set last_seen_at = now() where id = p_user_id;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_season text := public.current_season();
  v_official_room_id uuid;
begin
  insert into public.profiles (id, username, display_name, referral_code)
  values (
    new.id,
    'user_' || substr(new.id::text, 1, 8),
    coalesce(new.raw_user_meta_data->>'display_name', 'New Fan'),
    public.generate_referral_code()
  );

  select id into v_official_room_id from public.rooms where slug = 'official-' || v_season;

  if v_official_room_id is null then
    insert into public.rooms (
      slug, name, room_code, owner_id, visibility, room_type,
      season, is_official, is_pinned, auto_join, is_listed
    ) values (
      'official-' || v_season,
      'Official MatchRoom Season — ' || v_season,
      'OFF' || right(replace(v_season, '-', ''), 4),
      new.id, 'public', 'season_league',
      v_season, true, true, true, false
    ) returning id into v_official_room_id;
  end if;

  insert into public.room_members (room_id, user_id, role, is_auto)
  values (v_official_room_id, new.id, 'member', true)
  on conflict do nothing;

  return new;
end;
$$;
