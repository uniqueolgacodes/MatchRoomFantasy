-- Notification system, Phase B: the first real triggers on top of the
-- Phase A pipeline (0028). Anything inserted into `notifications`
-- already gets push automatically via dispatch_push_for_notification,
-- so these only have to insert rows.
--
-- Deliberately NOT included: virtual match pings (sets start every 10
-- minutes, so anything per-set would be spam), quiet hours and the
-- preferences UI (Phase C).

-- A key that makes "send this once" enforceable by the database
-- rather than by hoping a job never runs twice. Null for
-- notifications that aren't deduped.
alter table notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx
  on notifications (user_id, dedupe_key) where dedupe_key is not null;

-- Own preference for room-owner activity, so it can be switched off
-- independently of kickoff reminders. Needs its own column grant,
-- same convention as 0009/0020/0026. No settings page exposes it
-- yet — that lands in Phase C.
alter table profiles add column if not exists notify_room_activity boolean not null default true;
grant update (notify_room_activity) on public.profiles to authenticated;

-- ---------------------------------------------------------------
-- 1. Kickoff reminder: "a room you're in has a match starting soon
--    and you haven't made a pick yet".
-- ---------------------------------------------------------------
-- Real matches only (virtual ones kick off every 10 minutes), and
-- only user-created rooms (match_public/private). The official season
-- room and community rooms are linked to EVERY match of the season,
-- so including them would remind every user about every fixture.
-- Auto-joined memberships are excluded for the same reason.
-- Runs every 5 minutes against a 5-20 minute window, so one missed
-- tick can't skip a match; dedupe_key makes repeat ticks harmless.
create or replace function public.notify_kickoff_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with due as (
    select m.id as match_id, m.kickoff, h.name as home_name, a.name as away_name
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
    where m.is_virtual = false
      and m.status = 'scheduled'
      and m.kickoff > now() + interval '5 minutes'
      and m.kickoff <= now() + interval '20 minutes'
  ),
  targets as (
    select d.match_id, d.kickoff, d.home_name, d.away_name, rmem.user_id,
           (array_agg(r.id order by r.created_at))[1] as room_id
    from due d
    join room_matches rma on rma.match_id = d.match_id
    join rooms r on r.id = rma.room_id
      and r.is_archived = false
      and r.room_type in ('match_public', 'private')
    join room_members rmem on rmem.room_id = r.id and rmem.is_auto = false
    join profiles p on p.id = rmem.user_id and p.notify_kickoff
    where not exists (
      select 1
      from prediction_stakes ps
      join predictions pr on pr.id = ps.prediction_id
      where pr.match_id = d.match_id and ps.user_id = rmem.user_id
    )
    group by d.match_id, d.kickoff, d.home_name, d.away_name, rmem.user_id
  ),
  ins as (
    insert into notifications (user_id, type, title, body, deep_link, metadata, dedupe_key)
    select
      user_id,
      'reminder',
      'Kickoff soon',
      format('%s vs %s kicks off in about %s minutes. You haven''t made a pick yet.',
        home_name, away_name, greatest(1, round(extract(epoch from (kickoff - now())) / 60)::int)),
      '/rooms/' || room_id,
      jsonb_build_object('kind', 'kickoff', 'match_id', match_id, 'room_id', room_id),
      'kickoff:' || match_id
    from targets
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

revoke all on function public.notify_kickoff_reminders() from public, anon, authenticated;

select cron.schedule('notify-kickoff-reminders', '*/5 * * * *', $$
  select public.notify_kickoff_reminders();
$$);

-- ---------------------------------------------------------------
-- 2. Room activity: tell the owner when people join, and when the
--    room fills up.
-- ---------------------------------------------------------------
-- Joins collapse into ONE unread notification per room ("3 new
-- members joined X") rather than one per join. The follow-up joins
-- are UPDATEs, not INSERTs, so they refresh the in-app text without
-- firing the push dispatcher again — a popular room produces one
-- push, not one per person. Once the owner reads it, the next join
-- starts a fresh one.
create or replace function public.notify_room_owner_on_join()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_wants boolean;
  v_joiner text;
  v_existing_id uuid;
  v_existing_count integer;
  v_members integer;
begin
  select * into v_room from rooms where id = new.room_id;

  if not found
     or v_room.owner_id = new.user_id
     or new.is_auto
     or v_room.is_official
     or v_room.room_type not in ('match_public', 'private') then
    return new;
  end if;

  select notify_room_activity into v_wants from profiles where id = v_room.owner_id;
  if not coalesce(v_wants, true) then
    return new;
  end if;

  select coalesce(display_name, username) into v_joiner from profiles where id = new.user_id;

  select id, coalesce((metadata->>'count')::integer, 1)
    into v_existing_id, v_existing_count
  from notifications
  where user_id = v_room.owner_id
    and type = 'room_activity'
    and read_at is null
    and metadata->>'kind' = 'join'
    and metadata->>'room_id' = new.room_id::text
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    update notifications
    set metadata = jsonb_set(metadata, '{count}', to_jsonb(v_existing_count + 1)),
        title = 'New members',
        body = format('%s new members joined %s', v_existing_count + 1, v_room.name),
        created_at = now()
    where id = v_existing_id;
  else
    insert into notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_room.owner_id, 'room_activity', 'New member',
      format('%s joined %s', coalesce(v_joiner, 'Someone'), v_room.name),
      '/rooms/' || new.room_id,
      jsonb_build_object('kind', 'join', 'room_id', new.room_id, 'count', 1)
    );
  end if;

  select count(*) into v_members from room_members where room_id = new.room_id;
  if v_room.max_members is not null and v_members >= v_room.max_members then
    insert into notifications (user_id, type, title, body, deep_link, metadata, dedupe_key)
    values (
      v_room.owner_id, 'room_activity', 'Room is full',
      format('%s has reached its member limit.', v_room.name),
      '/rooms/' || new.room_id,
      jsonb_build_object('kind', 'full', 'room_id', new.room_id),
      'full:' || new.room_id
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return new;
end;
$$;

create trigger room_members_notify_owner
  after insert on room_members
  for each row execute function public.notify_room_owner_on_join();