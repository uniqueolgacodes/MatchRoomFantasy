-- 0009_security_hardening.sql
--
-- Closes the security holes found in the 0001-0008 review:
--   1. 20 tables had no RLS (anon key could read/write them).
--   2. apply_point_transaction was callable by any client (mint MP).
--   3. Clients could insert their own prediction_stakes / redemptions rows.
--   4. Profile self-update covered every column (is_system_admin, ...);
--      room_members self-insert allowed joining any room as 'owner'.
--   5. MP could be overdrawn (clamp-at-zero) and stakes were debited and
--      inserted in two separate, non-atomic steps.
--   6. Leaderboard views leaked every room's data.
--
-- It also fixes the infinite-recursion RLS policy on room_members (the
-- reason "Your Rooms" showed empty for signed-in users).
--
-- Design rule from here on: CLIENTS ONLY READ, plus a short allow-list of
-- harmless self-service writes. Anything that touches MP, rooms membership
-- or settlement goes through a SECURITY DEFINER function or the service role.
--
-- Convention for future migrations:
--   * new table  -> enable RLS + add policies (default privileges below no
--     longer give clients insert/update/delete automatically)
--   * new SECURITY DEFINER function -> `set search_path = public, pg_temp`,
--     then REVOKE from public/anon/authenticated and GRANT only who needs it.

-- =========================================================================
-- 1. Helper functions used by policies and views
-- =========================================================================

-- SECURITY DEFINER so policies on room_members can ask "am I a member?"
-- without re-triggering the room_members policy (that was the recursion).
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Used by the leaderboard views: members of the room, or the service role
-- (settle-room-match reads room_match_leaderboard with the service key).
create or replace function public.can_read_room(p_room_id uuid)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or public.is_room_member(p_room_id);
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.can_read_room(uuid) from public, anon;
-- anon needs is_room_member because the public `rooms` policy calls it
-- (it simply returns false when nobody is signed in).
grant execute on function public.is_room_member(uuid) to anon, authenticated, service_role;
grant execute on function public.can_read_room(uuid) to authenticated, service_role;

-- =========================================================================
-- 2. Table privileges: clients get read + an explicit allow-list of writes
-- =========================================================================

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;

-- Future tables: no automatic client write access.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;

-- Public read for anonymous visitors (RLS still applies on top)
grant select on public.teams, public.matches, public.match_events,
  public.news_articles, public.rooms to anon;

-- Safe self-service writes for signed-in users (RLS policies below)
grant update (
  display_name, avatar_url, favourite_team_id, timezone,
  buddy_enabled, buddy_position, buddy_volume,
  sound_enabled, sound_events, sound_ambient, sound_ui, sound_buddy, sound_notifications,
  notify_goals, notify_kickoff, notify_predictions, notify_room_mentions,
  notify_room_all, notify_email_digest, notify_push_enabled,
  trophies_public, onboarding_completed_at, age_confirmed_at
) on public.profiles to authenticated;

grant insert (
  slug, room_code, name, description, tags, owner_id, visibility, room_type,
  season, is_listed, max_members, expires_at, metadata
) on public.rooms to authenticated;
grant update (name, description, tags, is_listed) on public.rooms to authenticated;

grant insert on public.room_messages to authenticated;
-- update is needed because the onboarding page uses .upsert() (ON CONFLICT DO UPDATE)
grant insert, delete on public.user_teams to authenticated;
grant update (user_id, team_id) on public.user_teams to authenticated;
grant insert, update, delete on public.push_subscriptions to authenticated;
grant update (acknowledged) on public.offline_earnings_summary to authenticated;

-- =========================================================================
-- 3. Enable RLS everywhere (idempotent)
-- =========================================================================

alter table public.profiles                 enable row level security;
alter table public.teams                    enable row level security;
alter table public.matches                  enable row level security;
alter table public.match_events             enable row level security;
alter table public.match_snapshots          enable row level security;
alter table public.user_teams               enable row level security;
alter table public.rooms                    enable row level security;
alter table public.room_matches             enable row level security;
alter table public.room_members             enable row level security;
alter table public.room_messages            enable row level security;
alter table public.point_balances           enable row level security;
alter table public.point_transactions       enable row level security;
alter table public.revival_spins            enable row level security;
alter table public.season_rollovers         enable row level security;
alter table public.offline_earnings_summary enable row level security;
alter table public.settlement_locks         enable row level security;
alter table public.predictions              enable row level security;
alter table public.prediction_stakes        enable row level security;
alter table public.redemption_items         enable row level security;
alter table public.redemptions              enable row level security;
alter table public.room_match_scores        enable row level security;
alter table public.room_awards              enable row level security;
alter table public.trophies                 enable row level security;
alter table public.season_room_champions    enable row level security;
alter table public.fantasy_teams            enable row level security;
alter table public.fantasy_picks            enable row level security;
alter table public.news_articles            enable row level security;
alter table public.api_cache                enable row level security;
alter table public.push_subscriptions       enable row level security;
alter table public.moderation_actions       enable row level security;

-- Tables with NO policy at all are service-role only:
--   match_snapshots, settlement_locks, api_cache

-- =========================================================================
-- 4. Policies
-- =========================================================================

-- profiles ---------------------------------------------------------------
-- Signed-in users can read profiles (usernames/avatars show across the app).
-- No longer readable by anon. (Follow-up: move the private columns such as
-- referral_code/last_seen_at behind a public_profiles view.)
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
-- Which columns can be updated is enforced by the column grant above:
-- username (use set_username()), is_system_admin, referral_*, last_* are not.

-- Onboarding can't be marked complete without the age confirmation.
create or replace function public.enforce_age_before_onboarding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is distinct from new.onboarding_completed_at
     and new.age_confirmed_at is null then
    raise exception 'age_confirmation_required';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_age_before_onboarding on public.profiles;
create trigger profiles_age_before_onboarding
  before update on public.profiles
  for each row execute function public.enforce_age_before_onboarding();

-- Public reference data ------------------------------------------------------
create policy "teams are public" on public.teams
  for select to anon, authenticated using (true);
create policy "matches are public" on public.matches
  for select to anon, authenticated using (true);
create policy "match events are public" on public.match_events
  for select to anon, authenticated using (true);
create policy "news is public" on public.news_articles
  for select to anon, authenticated using (true);
create policy "predictions are readable" on public.predictions
  for select to authenticated using (true);
create policy "active redemption items are readable" on public.redemption_items
  for select to authenticated using (is_active);

-- rooms ------------------------------------------------------------------
drop policy if exists "public rooms are readable" on public.rooms;
create policy "public rooms are readable"
  on public.rooms for select using (
    visibility = 'public'
    or owner_id = auth.uid()
    or public.is_room_member(id)
  );

drop policy if exists "owners manage their rooms" on public.rooms;
create policy "owners update their rooms"
  on public.rooms for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "authenticated users create rooms" on public.rooms;
create policy "authenticated users create rooms"
  on public.rooms for insert to authenticated
  with check (
    auth.uid() = owner_id
    and room_type in ('match_public', 'private', 'season_league', 'community')
    and slug !~* '^(official|world)-'
    and (max_members is null or max_members between 2 and 500)
  );
-- is_official / is_pinned / auto_join / is_archived are not in the insert
-- column grant, so users can't set them.

-- When a signed-in user creates a room, make them its owner-member.
-- (System-created rooms run without auth.uid() and are skipped.)
create or replace function public.add_room_owner_as_member()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() = new.owner_id then
    insert into public.room_members (room_id, user_id, role, is_auto)
    values (new.id, new.owner_id, 'owner', false)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.add_room_owner_as_member() from public, anon, authenticated;

drop trigger if exists rooms_add_owner_member on public.rooms;
create trigger rooms_add_owner_member
  after insert on public.rooms
  for each row execute function public.add_room_owner_as_member();

-- room_members: read only. Joining happens via join_room_by_code() /
-- join_public_room() below, so nobody can self-assign a role or bypass
-- codes, capacity or bans.
drop policy if exists "members read their room's membership" on public.room_members;
create policy "members read their room's membership"
  on public.room_members for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));

drop policy if exists "users join rooms for themselves" on public.room_members;

-- room_messages ----------------------------------------------------------
drop policy if exists "members read room messages" on public.room_messages;
create policy "members read room messages"
  on public.room_messages for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members post room messages" on public.room_messages;
create policy "members post room messages"
  on public.room_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and is_system = false
    and public.is_room_member(room_id)
  );

-- room_matches / scores / awards / trophies -------------------------------
create policy "room matches follow room visibility"
  on public.room_matches for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_matches.room_id));

create policy "members read room match scores"
  on public.room_match_scores for select to authenticated
  using (public.is_room_member(room_id));

create policy "members read room awards"
  on public.room_awards for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));

create policy "members read season champions"
  on public.season_room_champions for select to authenticated
  using (public.is_room_member(room_id));

create policy "trophies readable when public or own"
  on public.trophies for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = trophies.user_id and p.trophies_public)
  );

-- Stakes and redemptions: read own; NO client insert -------------------------
drop policy if exists "users create their own stakes" on public.prediction_stakes;
drop policy if exists "users create their own redemptions" on public.redemptions;

-- user_teams -------------------------------------------------------------
create policy "users read own followed teams" on public.user_teams
  for select to authenticated using (user_id = auth.uid());
create policy "users follow teams" on public.user_teams
  for insert to authenticated with check (user_id = auth.uid());
create policy "users re-follow teams" on public.user_teams
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users unfollow teams" on public.user_teams
  for delete to authenticated using (user_id = auth.uid());

-- push_subscriptions (original policy lacked WITH CHECK) -------------------
drop policy if exists "users manage their own push subscriptions" on public.push_subscriptions;
create policy "users manage their own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Other per-user tables --------------------------------------------------------
create policy "users read own rollovers" on public.season_rollovers
  for select to authenticated using (user_id = auth.uid());

create policy "users read own offline summaries" on public.offline_earnings_summary
  for select to authenticated using (user_id = auth.uid());
create policy "users acknowledge own offline summaries" on public.offline_earnings_summary
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users read own fantasy teams" on public.fantasy_teams
  for select to authenticated using (user_id = auth.uid());
create policy "users read own fantasy picks" on public.fantasy_picks
  for select to authenticated using (
    exists (select 1 from public.fantasy_teams ft
            where ft.id = fantasy_picks.fantasy_team_id and ft.user_id = auth.uid())
  );

create policy "room staff and admins read moderation log"
  on public.moderation_actions for select to authenticated
  using (
    exists (select 1 from public.room_members rm
            where rm.room_id = moderation_actions.room_id
              and rm.user_id = auth.uid() and rm.role in ('owner', 'admin'))
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_system_admin)
  );

-- =========================================================================
-- 5. Views: stop leaking other rooms' data
-- =========================================================================
-- These views run as their owner (needed so they can aggregate across
-- users), so they filter to rooms the caller belongs to via can_read_room().
-- Note: querying them from the SQL editor as postgres returns no rows,
-- because there is no signed-in user. Test as a user or via the service role.

create or replace view public.room_leaderboard as
 select rms.room_id,
    rms.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    sum(rms.points_earned) as total_points,
    sum(rms.points_staked) as total_staked,
    sum(rms.points_won) as total_won,
    count(distinct rms.match_id) as matches_played,
    rank() over (partition by rms.room_id order by sum(rms.points_earned) desc) as rank
   from public.room_match_scores rms
     join public.profiles p on p.id = rms.user_id
  where public.can_read_room(rms.room_id)
  group by rms.room_id, rms.user_id, p.username, p.display_name, p.avatar_url;

create or replace view public.room_match_leaderboard as
 select ps.room_id,
    ps.prediction_id,
    p.match_id,
    ps.user_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    sum(ps.stake) as points_staked,
    sum(coalesce(ps.points_awarded, 0)) as points_won,
    sum(coalesce(ps.points_awarded, 0)) - sum(ps.stake) as points_earned,
    rank() over (partition by ps.room_id, p.match_id
                 order by (sum(coalesce(ps.points_awarded, 0)) - sum(ps.stake)) desc) as rank
   from public.prediction_stakes ps
     join public.predictions p on p.id = ps.prediction_id
     join public.profiles pr on pr.id = ps.user_id
  where ps.room_id is not null
    and ps.is_correct is not null
    and public.can_read_room(ps.room_id)
  group by ps.room_id, ps.prediction_id, p.match_id, ps.user_id, pr.username, pr.display_name, pr.avatar_url;

-- View grants: signed-in read only. (world_rankings_top100 is intentionally
-- global; recommended_rooms only lists public rooms; my_open_selections
-- already filters on auth.uid().)
revoke all on public.world_rankings_top100, public.room_leaderboard,
  public.room_match_leaderboard, public.my_open_selections,
  public.recommended_rooms from anon, authenticated;
grant select on public.world_rankings_top100, public.room_leaderboard,
  public.room_match_leaderboard, public.my_open_selections,
  public.recommended_rooms to authenticated, service_role;

-- =========================================================================
-- 6. Lock down privileged functions
-- =========================================================================

-- apply_point_transaction: never callable by clients. Also refuses to
-- overdraw (previously it silently clamped to 0, so a 3 MP user could stake 20).
create or replace function public.apply_point_transaction(
  p_user_id uuid,
  p_amount integer,
  p_reason public.point_reason,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_season text := public.current_season();
  v_balance integer;
  v_new_balance integer;
begin
  select balance into v_balance
  from public.point_balances
  where user_id = p_user_id and season = v_season
  for update;

  if not found then
    insert into public.point_balances (user_id, season, balance)
    values (p_user_id, v_season, 10)
    returning balance into v_balance;
  end if;

  -- Debits must be fully covered. Manual admin corrections may still clamp.
  if p_amount < 0 and v_balance + p_amount < 0 and p_reason <> 'admin_adjustment' then
    raise exception 'insufficient_balance';
  end if;

  v_new_balance := greatest(0, v_balance + p_amount);

  update public.point_balances
  set balance = v_new_balance,
      lifetime_earned = lifetime_earned + greatest(0, p_amount),
      lifetime_lost = lifetime_lost + greatest(0, -p_amount),
      updated_at = now()
  where user_id = p_user_id and season = v_season;

  insert into public.point_transactions
    (user_id, amount, balance_after, reason, reference_id, metadata, season)
  values
    (p_user_id, p_amount, v_new_balance, p_reason, p_reference_id, p_metadata, v_season);

  return v_new_balance;
end;
$$;

revoke all on function public.apply_point_transaction(uuid, integer, public.point_reason, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_point_transaction(uuid, integer, public.point_reason, uuid, jsonb)
  to service_role;

-- Server-side only functions
revoke all on function public.settle_predictions_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.settle_predictions_batch(uuid, jsonb) to service_role;

revoke all on function public.lock_expired_predictions()      from public, anon, authenticated;
revoke all on function public.archive_expired_rooms()         from public, anon, authenticated;
revoke all on function public.purge_stale_private_rooms()     from public, anon, authenticated;
revoke all on function public.rollover_season(text)           from public, anon, authenticated;
revoke all on function public.on_full_time_snapshot()         from public, anon, authenticated;
revoke all on function public.handle_new_user()               from public, anon, authenticated;
revoke all on function public.populate_season_room_matches()  from public, anon, authenticated;
grant execute on function public.lock_expired_predictions()     to service_role;
grant execute on function public.archive_expired_rooms()        to service_role;
grant execute on function public.purge_stale_private_rooms()    to service_role;
grant execute on function public.rollover_season(text)          to service_role;

-- touch_last_seen: callers may only touch their own row
create or replace function public.touch_last_seen(p_user_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.profiles set last_seen_at = now()
  where id = p_user_id and id = auth.uid();
$$;

-- set_username: now SECURITY DEFINER so the `username` column doesn't need a
-- client update grant (validation can't be bypassed with a direct update).
create or replace function public.set_username(p_username text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_normalized text := lower(trim(p_username));
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters: letters, numbers, underscores only';
  end if;

  if v_normalized in ('admin', 'administrator', 'support', 'help',
    'official', 'matchroom', 'system', 'root', 'moderator', 'mod') then
    raise exception 'That username is reserved';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = v_normalized and id <> auth.uid()
  ) then
    raise exception 'That username is already taken';
  end if;

  update public.profiles set username = v_normalized, updated_at = now() where id = auth.uid();
end;
$$;

-- Signed-in only for the rest
revoke all on function public.touch_last_seen(uuid)          from public, anon;
revoke all on function public.set_username(text)             from public, anon;
revoke all on function public.is_username_available(text)    from public, anon;
revoke all on function public.generate_room_code()           from public, anon;
revoke all on function public.generate_referral_code()       from public, anon;
grant execute on function public.touch_last_seen(uuid)       to authenticated, service_role;
grant execute on function public.set_username(text)          to authenticated, service_role;
grant execute on function public.is_username_available(text) to authenticated, service_role;
grant execute on function public.generate_room_code()        to authenticated, service_role;
grant execute on function public.generate_referral_code()    to authenticated, service_role;

-- =========================================================================
-- 7. place_prediction_stake(): atomic, validated stake placement
-- =========================================================================
-- One transaction: validate -> debit -> insert. Any failure (including a
-- duplicate-stake race caught by the unique index) rolls the debit back too.
-- Errors are raised as short codes the API route maps to messages:
--   unauthorized, invalid_stake, prediction_not_found, prediction_closed,
--   invalid_answer, not_a_member, room_not_available, already_predicted,
--   insufficient_balance
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

-- =========================================================================
-- 8. Joining rooms (replaces the client-side room_members insert)
-- =========================================================================
-- Errors: unauthorized, room_not_found, banned, room_full

create or replace function public.internal_join_room(p_room_id uuid, p_uid uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer;
  v_already boolean;
begin
  if p_uid is null then
    raise exception 'unauthorized';
  end if;

  -- Lock the room row so concurrent joins can't overshoot max_members
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found
     or v_room.is_archived
     or (v_room.expires_at is not null and v_room.expires_at < now())
     or v_room.slug like 'world-%' then
    raise exception 'room_not_found';
  end if;

  v_already := exists (select 1 from public.room_members
                       where room_id = p_room_id and user_id = p_uid);

  if not v_already then
    if (select m.action
        from public.moderation_actions m
        where m.room_id = p_room_id and m.target_user_id = p_uid
          and m.action in ('ban', 'unban')
        order by m.created_at desc limit 1) = 'ban' then
      raise exception 'banned';
    end if;

    select count(*) into v_count from public.room_members where room_id = p_room_id;
    if v_room.max_members is not null and v_count >= v_room.max_members then
      raise exception 'room_full';
    end if;

    insert into public.room_members (room_id, user_id, role, is_auto)
    values (p_room_id, p_uid, 'member', false)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'id', v_room.id, 'slug', v_room.slug, 'name', v_room.name,
    'room_type', v_room.room_type, 'already_member', v_already);
end;
$$;

revoke all on function public.internal_join_room(uuid, uuid) from public, anon, authenticated;

create or replace function public.join_room_by_code(p_code text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  select id into v_id from public.rooms
  where room_code = upper(trim(coalesce(p_code, ''))) and is_archived = false;
  if v_id is null then
    raise exception 'room_not_found';
  end if;
  return public.internal_join_room(v_id, auth.uid());
end;
$$;

-- For public rooms only (/r/[slug], discover). Private rooms need a code.
create or replace function public.join_public_room(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not exists (select 1 from public.rooms
                 where id = p_room_id and visibility = 'public') then
    raise exception 'room_not_found';
  end if;
  return public.internal_join_room(p_room_id, auth.uid());
end;
$$;

revoke all on function public.join_room_by_code(text)  from public, anon;
revoke all on function public.join_public_room(uuid)   from public, anon;
grant execute on function public.join_room_by_code(text) to authenticated;
grant execute on function public.join_public_room(uuid)  to authenticated;
