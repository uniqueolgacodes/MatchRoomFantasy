-- Fixes three room bugs reported by testers.
--
-- 1. A room covering two days of matches disappeared after the first
--    day's match finished. archive_expired_rooms() joined room_matches
--    to matches and archived the room as soon as ANY linked match was
--    full_time for 3 hours. Rooms made with create_room() (0025) can
--    link several matches, so a two-day room was archived after day
--    one. It now waits until EVERY linked match is over. The same flaw
--    in purge_stale_private_rooms() is worse (it also deletes
--    messages and stakes), so it gets the same fix.
--
-- 2. The room leaderboard never filled in. settle-room-match read
--    room_match_leaderboard, which has one row per user PER MARKET,
--    and upserted those rows into room_match_scores. That table is
--    unique on (room_id, match_id, user_id), so a user with stakes on
--    two or more markets violated the constraint and the whole upsert
--    failed. The function never checked the error, so it reported
--    success and left the table empty. Scores are now aggregated per
--    user in SQL (refresh_room_match_scores), and the function checks
--    errors. Already-settled matches are backfilled below.
--
-- 3. room_standings lists every member, including those with no
--    settled picks yet, so the leaderboard is no longer an empty box
--    until the first match finishes.

-- ------------------------------------------------------------------
-- 1. Room lifecycle
-- ------------------------------------------------------------------
create or replace function public.archive_expired_rooms()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- match_public rooms: archive once EVERY linked match is over
  -- (full_time or cancelled) and the last one finished 3+ hours ago.
  -- Safety valve: also archive if the latest kickoff is over 7 days
  -- old, so a match stuck in a non-final status can't keep a room open
  -- forever.
  update public.rooms r
  set is_archived = true, archived_at = now()
  where r.room_type = 'match_public'
    and r.is_archived = false
    and exists (select 1 from public.room_matches rm where rm.room_id = r.id)
    and (
      (
        not exists (
          select 1
          from public.room_matches rm
          join public.matches m on m.id = rm.match_id
          where rm.room_id = r.id and m.status not in ('full_time', 'cancelled')
        )
        and (
          select max(m.updated_at)
          from public.room_matches rm
          join public.matches m on m.id = rm.match_id
          where rm.room_id = r.id
        ) < now() - interval '3 hours'
      )
      or (
        select max(m.kickoff)
        from public.room_matches rm
        join public.matches m on m.id = rm.match_id
        where rm.room_id = r.id
      ) < now() - interval '7 days'
    );

  -- general rooms are one-match-only, unchanged.
  update public.rooms r
  set is_archived = true, archived_at = now()
  from public.room_matches rm, public.matches m
  where r.id = rm.room_id and rm.match_id = m.id
    and r.room_type = 'general'
    and m.kickoff < now() - interval '6 hours'
    and r.is_archived = false;
end;
$$;

create or replace function public.purge_stale_private_rooms()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_stale_ids uuid[];
begin
  select array_agg(r.id) into v_stale_ids
  from public.rooms r
  where r.room_type = 'private'
    and r.is_archived = false
    and exists (select 1 from public.room_matches rm where rm.room_id = r.id)
    and not exists (
      select 1
      from public.room_matches rm
      join public.matches m on m.id = rm.match_id
      where rm.room_id = r.id and m.status not in ('full_time', 'cancelled')
    )
    and (
      select max(m.updated_at)
      from public.room_matches rm
      join public.matches m on m.id = rm.match_id
      where rm.room_id = r.id
    ) < now() - interval '14 days';

  if v_stale_ids is null then return; end if;

  update public.rooms set is_archived = true, archived_at = now() where id = any(v_stale_ids);
  delete from public.room_messages where room_id = any(v_stale_ids);
  delete from public.prediction_stakes
  where room_id = any(v_stale_ids)
    and prediction_id in (
      select id from public.predictions
      where match_id in (select match_id from public.room_matches where room_id = any(v_stale_ids))
    );
end;
$$;

-- Bring back rooms the old logic archived too early: still has a match
-- that isn't over, and that match isn't ancient.
update public.rooms r
set is_archived = false, archived_at = null
where r.is_archived = true
  and r.room_type in ('match_public', 'private')
  and exists (
    select 1
    from public.room_matches rm
    join public.matches m on m.id = rm.match_id
    where rm.room_id = r.id and m.status not in ('full_time', 'cancelled')
  )
  and (
    select max(m.kickoff)
    from public.room_matches rm
    join public.matches m on m.id = rm.match_id
    where rm.room_id = r.id
  ) >= now() - interval '7 days';

-- ------------------------------------------------------------------
-- 2. Room score aggregation
-- ------------------------------------------------------------------
create or replace function public.refresh_room_match_scores(p_match_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  with agg as (
    select ps.room_id,
           ps.user_id,
           sum(ps.stake)::int as points_staked,
           sum(coalesce(ps.points_awarded, 0))::int as points_won
    from public.prediction_stakes ps
    join public.predictions p on p.id = ps.prediction_id
    where p.match_id = p_match_id
      and ps.room_id is not null
      and ps.settled_at is not null  -- includes voided (refunded) stakes: net 0
    group by ps.room_id, ps.user_id
  ),
  ranked as (
    select a.*,
           (a.points_won - a.points_staked) as points_earned,
           rank() over (partition by a.room_id order by (a.points_won - a.points_staked) desc)::int as rnk
    from agg a
  )
  insert into public.room_match_scores
    (room_id, match_id, user_id, points_earned, points_staked, points_won, rank, settled_at)
  select room_id, p_match_id, user_id, points_earned, points_staked, points_won, rnk, now()
  from ranked
  on conflict (room_id, match_id, user_id) do update
    set points_earned = excluded.points_earned,
        points_staked = excluded.points_staked,
        points_won    = excluded.points_won,
        rank          = excluded.rank,
        settled_at    = excluded.settled_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Called by settle-room-match with the service key only.
revoke all on function public.refresh_room_match_scores(uuid) from public, anon, authenticated;
grant execute on function public.refresh_room_match_scores(uuid) to service_role;

-- Backfill every match that already has settled room stakes. Safe to
-- re-run: it upserts on (room_id, match_id, user_id). It does NOT pay
-- the room-winner bonus retroactively; settlement_locks already marks
-- those matches as handled, which prevents any double award.
select public.refresh_room_match_scores(t.match_id)
from (
  select distinct p.match_id
  from public.prediction_stakes ps
  join public.predictions p on p.id = ps.prediction_id
  where ps.room_id is not null and ps.settled_at is not null
) t;

-- ------------------------------------------------------------------
-- 3. Standings that include every member
-- ------------------------------------------------------------------
-- Same ownership model as room_leaderboard (0009): runs as owner so it
-- can read other members' names, filtered to rooms the caller can read.
create or replace view public.room_standings as
 select rm.room_id,
    rm.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(sum(rms.points_earned), 0)::int as total_points,
    coalesce(sum(rms.points_staked), 0)::int as total_staked,
    coalesce(sum(rms.points_won), 0)::int as total_won,
    count(rms.match_id)::int as matches_played,
    rank() over (partition by rm.room_id order by coalesce(sum(rms.points_earned), 0) desc)::int as rank
   from public.room_members rm
     join public.profiles p on p.id = rm.user_id
     left join public.room_match_scores rms
       on rms.room_id = rm.room_id and rms.user_id = rm.user_id
  where public.can_read_room(rm.room_id)
  group by rm.room_id, rm.user_id, p.username, p.display_name, p.avatar_url;

revoke all on public.room_standings from anon, authenticated;
grant select on public.room_standings to authenticated, service_role;