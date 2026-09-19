-- MatchRoom Fantasy — initial schema
-- Source: MATCH_ROOM_PRD.md v4.0/v5, Section 8 (Database Schema)

-- ============================================================
-- Enums
-- ============================================================

create type match_status as enum (
  'scheduled', 'live', 'half_time', 'full_time',
  'postponed', 'cancelled', 'suspended'
);

create type match_event_type as enum (
  'kickoff', 'half_time', 'full_time',
  'goal', 'own_goal', 'penalty_scored', 'penalty_missed',
  'yellow_card', 'red_card', 'second_yellow',
  'substitution', 'var_check', 'var_overturn',
  'near_miss', 'big_save', 'corner', 'free_kick',
  'community_event'
);

create type prediction_status as enum ('open', 'locked', 'settled', 'voided');
create type prediction_outcome as enum (
  'yes', 'no', 'home', 'away', 'draw', 'over', 'under', 'voided'
);

create type room_visibility as enum ('private', 'public');
create type room_type as enum (
  'general', 'match_public', 'private', 'season_league', 'community'
);

create type point_reason as enum (
  'season_start', 'season_carryover', 'season_champion_bonus',
  'referral_bonus', 'referral_received', 'welcome_back',
  'prediction_stake', 'prediction_win', 'prediction_loss',
  'revival_win', 'private_room_win',
  'redemption', 'admin_adjustment'
);

create type trophy_type as enum ('match_winner', 'season_champion', 'world_champion');
create type buddy_position as enum ('bottom-right', 'bottom-left', 'top-right', 'top-left');
create type buddy_volume as enum ('off', 'quiet', 'normal');

-- Checkpoint model (v5 §6) — replaces continuous live polling.
create type snapshot_checkpoint as enum ('kickoff', 'half_time', 'full_time');

-- ============================================================
-- Core tables
-- ============================================================

create table teams (
  id text primary key,
  name text not null,
  short_name text not null,
  crest_url text,
  league_id text not null default 'epl',
  external_id integer,
  primary_color text,
  secondary_color text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  favourite_team_id text references teams(id),
  timezone text not null default 'Africa/Lagos',

  buddy_enabled boolean not null default true,
  buddy_position buddy_position not null default 'bottom-right',
  buddy_volume buddy_volume not null default 'quiet',

  sound_enabled boolean not null default true,
  sound_events numeric(3,2) not null default 0.70,
  sound_ambient numeric(3,2) not null default 0.20,
  sound_ui numeric(3,2) not null default 0.40,
  sound_buddy numeric(3,2) not null default 0.50,
  sound_notifications numeric(3,2) not null default 0.60,

  notify_goals boolean not null default true,
  notify_kickoff boolean not null default true,
  notify_predictions boolean not null default true,
  notify_room_mentions boolean not null default true,
  notify_room_all boolean not null default false,
  notify_email_digest boolean not null default true,
  notify_push_enabled boolean not null default true,

  referral_code text unique not null,
  referred_by uuid references profiles(id),
  referral_applied boolean not null default false,

  last_seen_at timestamptz not null default now(),
  last_welcome_back_at timestamptz,

  trophies_public boolean not null default true,
  is_system_admin boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_idx on profiles (username);
create index profiles_referral_code_idx on profiles (referral_code);
create index profiles_last_seen_idx on profiles (last_seen_at);

create table matches (
  id uuid primary key default gen_random_uuid(),
  external_id integer unique not null,
  league_id text not null default 'epl',
  season text not null,
  matchday integer,
  home_team_id text not null references teams(id),
  away_team_id text not null references teams(id),
  kickoff timestamptz not null,
  status match_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  minute integer,
  venue text,
  active_viewer_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_kickoff_idx on matches (kickoff);
create index matches_status_idx on matches (status);
create index matches_season_idx on matches (season);

-- Checkpoint snapshots (v5 §6.8) — settlement source of truth.
-- Replaces the v4.0 approach of overwriting live state in place.
create table match_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  checkpoint snapshot_checkpoint not null,
  home_score integer not null,
  away_score integer not null,
  home_cards integer,
  away_cards integer,
  home_corners integer,
  away_corners integer,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (match_id, checkpoint)
);

create index match_snapshots_match_idx on match_snapshots (match_id);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  type match_event_type not null,
  minute integer not null,
  team_id text references teams(id),
  player_name text,
  player_out_name text,
  detail text,
  external_event_id text unique,
  created_at timestamptz not null default now()
);

create index match_events_match_idx on match_events (match_id, minute);
create index match_events_type_idx on match_events (type);

create table user_teams (
  user_id uuid not null references profiles(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

-- ============================================================
-- Room tables
-- ============================================================

create table rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  room_code text unique not null,
  name text not null,
  description text,
  tags text[] default '{}',
  owner_id uuid not null references profiles(id),
  visibility room_visibility not null default 'private',
  room_type room_type not null default 'private',
  season text,
  is_official boolean not null default false,
  is_pinned boolean not null default false,
  is_listed boolean not null default false,
  auto_join boolean not null default false,
  max_members integer not null default 200,
  expires_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index rooms_slug_idx on rooms (slug);
create index rooms_code_idx on rooms (room_code);
create index rooms_owner_idx on rooms (owner_id);
create index rooms_type_idx on rooms (room_type, is_archived);
create index rooms_pinned_idx on rooms (is_pinned, created_at desc)
  where is_pinned = true and is_archived = false;
create index rooms_expires_idx on rooms (expires_at)
  where expires_at is not null and is_archived = false;
create index rooms_listed_idx on rooms (is_listed, room_type)
  where is_listed = true and is_archived = false;
create unique index rooms_world_season_idx on rooms (season)
  where room_type = 'season_league' and slug like 'world-%';
create unique index rooms_official_season_idx on rooms (season)
  where room_type = 'season_league' and is_official = true;

create table room_matches (
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (room_id, match_id)
);

create index room_matches_match_idx on room_matches (match_id);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  is_auto boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_idx on room_members (user_id);
create index room_members_room_idx on room_members (room_id);

create table room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references profiles(id),
  body text not null,
  is_system boolean not null default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index room_messages_scoped_idx on room_messages (room_id, match_id, created_at desc);

-- ============================================================
-- Match Points tables
-- ============================================================

create table point_balances (
  user_id uuid not null references profiles(id) on delete cascade,
  season text not null,
  balance integer not null default 10,
  lifetime_earned integer not null default 10,
  lifetime_lost integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, season)
);

create index point_balances_season_idx on point_balances (season, balance desc);

create table point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  balance_after integer not null,
  reason point_reason not null,
  reference_id uuid,
  metadata jsonb default '{}',
  season text not null,
  created_at timestamptz not null default now()
);

create index point_tx_user_idx on point_transactions (user_id, created_at desc);
create index point_tx_season_idx on point_transactions (season);

create table revival_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  season text not null,
  outcome integer not null check (outcome between 0 and 5),
  balance_before integer not null,
  balance_after integer not null,
  spun_at timestamptz not null default now()
);

create index revival_user_idx on revival_spins (user_id, spun_at desc);

create table season_rollovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  from_season text not null,
  to_season text not null,
  final_balance integer not null,
  carryover_awarded integer not null,
  new_balance integer not null,
  was_top_ranked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, to_season)
);

create table offline_earnings_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  settled_from timestamptz not null,
  settled_to timestamptz not null,
  total_won integer not null,
  total_lost integer not null,
  net integer not null,
  stake_count integer not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create index offline_summary_user_idx on offline_earnings_summary (user_id, created_at desc)
  where acknowledged = false;

-- Idempotency lock for settlement functions (v5 §17.1).
create table settlement_locks (
  match_id uuid not null references matches(id),
  kind text not null check (kind in ('predictions', 'room_match', 'gameweek')),
  claimed_at timestamptz not null default now(),
  primary key (match_id, kind)
);

-- ============================================================
-- Prediction tables (v5 §15 — pre-match + half-time windows only)
-- ============================================================

create table predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  phase text not null check (phase in ('pre_match', 'half_time')),
  category text not null,
  question text not null,
  options jsonb not null,
  odds_multiplier numeric(4,2) not null,
  opens_at timestamptz not null default now(),
  locks_at timestamptz not null,
  status prediction_status not null default 'open',
  settled_at timestamptz,
  correct_outcome prediction_outcome,
  resolution_rule jsonb not null,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create index predictions_match_idx on predictions (match_id, phase, status);
create index predictions_locks_idx on predictions (locks_at) where status = 'open';

create table prediction_stakes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  answer text not null,
  stake integer not null check (stake between 1 and 20),
  odds_multiplier numeric(4,2) not null,
  potential_payout integer not null,
  is_correct boolean,
  points_awarded integer,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index prediction_stakes_unique
  on prediction_stakes (prediction_id, user_id, room_id) nulls not distinct;
create index prediction_stakes_user_idx on prediction_stakes (user_id, created_at desc);
create index prediction_stakes_room_idx on prediction_stakes (room_id);

-- ============================================================
-- Redemption tables
-- ============================================================

create table redemption_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  cost integer not null,
  category text not null check (category in ('cosmetic','badge','theme','sponsored_prize')),
  stock integer,
  metadata jsonb default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references redemption_items(id),
  points_spent integer not null,
  status text not null default 'fulfilled' check (status in ('pending','fulfilled','cancelled')),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Score & trophy tables
-- ============================================================

create table room_match_scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  points_earned integer not null default 0,
  points_staked integer not null default 0,
  points_won integer not null default 0,
  rank integer,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, match_id, user_id)
);

create index room_match_scores_idx on room_match_scores (room_id, match_id, points_earned desc);

create table room_awards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  award_type text not null check (award_type in ('match_winner','season_champion')),
  points integer not null,
  card_url text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index room_awards_user_idx on room_awards (user_id);

create table trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  trophy_type trophy_type not null,
  room_id uuid references rooms(id) on delete set null,
  season text,
  match_id uuid references matches(id) on delete set null,
  points integer,
  card_url text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index trophies_user_idx on trophies (user_id, created_at desc);

create table season_room_champions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  season text not null,
  user_id uuid not null references profiles(id),
  total_points integer not null,
  card_url text,
  created_at timestamptz not null default now(),
  unique (room_id, season)
);

-- ============================================================
-- Fantasy tables
-- ============================================================

create table fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  season text not null,
  gameweek integer not null,
  formation text not null default '4-3-3',
  budget_used numeric(5,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, room_id, season, gameweek)
);

create table fantasy_picks (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references fantasy_teams(id) on delete cascade,
  player_id integer not null,
  player_name text not null,
  team_id text not null references teams(id),
  position text not null check (position in ('GK','DEF','MID','FWD')),
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  is_bench boolean not null default false,
  bench_order integer,
  points integer default 0
);

create index fantasy_picks_team_idx on fantasy_picks (fantasy_team_id);

-- ============================================================
-- News & cache tables
-- ============================================================

create table news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  url text unique not null,
  image_url text,
  source text not null,
  published_at timestamptz not null,
  team_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index news_published_idx on news_articles (published_at desc);
create index news_teams_idx on news_articles using gin (team_ids);

create table api_cache (
  cache_key text primary key,
  payload jsonb not null,
  source text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index api_cache_expires_idx on api_cache (expires_at);

-- ============================================================
-- Notification & moderation tables
-- ============================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null default 'onesignal' check (provider in ('onesignal','webpush')),
  external_id text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, provider, external_id)
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  actor_id uuid not null references profiles(id),
  target_user_id uuid references profiles(id),
  action text not null check (action in (
    'kick','ban','unban','mute','unmute',
    'promote_admin','demote_admin',
    'delete_message','edit_room','archive_room'
  )),
  reason text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index moderation_actions_room_idx on moderation_actions (room_id, created_at desc);
create index moderation_actions_target_idx on moderation_actions (target_user_id, created_at desc);

-- ============================================================
-- Utility functions
-- ============================================================

create or replace function public.current_season()
returns text language sql stable as $$
  select case
    when extract(month from now()) >= 8 then
      extract(year from now())::text || '-' || (extract(year from now()) + 1)::text
    else
      (extract(year from now()) - 1)::text || '-' || extract(year from now())::text
  end;
$$;

create or replace function public.generate_room_code()
returns text language plpgsql as $$
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
    select exists(select 1 from rooms where room_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    select exists(select 1 from profiles where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function public.apply_point_transaction(
  p_user_id uuid,
  p_amount integer,
  p_reason point_reason,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'
)
returns integer
language plpgsql security definer as $$
declare
  v_season text := public.current_season();
  v_balance integer;
  v_new_balance integer;
begin
  select balance into v_balance
  from point_balances
  where user_id = p_user_id and season = v_season
  for update;

  if not found then
    insert into point_balances (user_id, season, balance)
    values (p_user_id, v_season, 10)
    returning balance into v_balance;
  end if;

  v_new_balance := greatest(0, v_balance + p_amount);

  update point_balances
  set balance = v_new_balance,
      lifetime_earned = lifetime_earned + greatest(0, p_amount),
      lifetime_lost = lifetime_lost + greatest(0, -p_amount),
      updated_at = now()
  where user_id = p_user_id and season = v_season;

  insert into point_transactions
    (user_id, amount, balance_after, reason, reference_id, metadata, season)
  values
    (p_user_id, p_amount, v_new_balance, p_reason, p_reference_id, p_metadata, v_season);

  return v_new_balance;
end;
$$;

create or replace function public.touch_last_seen(p_user_id uuid)
returns void language sql security definer as $$
  update profiles set last_seen_at = now() where id = p_user_id;
$$;

-- Settle a batch of prediction outcomes atomically (v5 §17.2).
-- p_awards: jsonb array of { prediction_id, user_id, correct, mp_change }
create or replace function public.settle_predictions_batch(
  p_match_id uuid,
  p_awards jsonb
) returns void language plpgsql as $$
declare
  award jsonb;
begin
  for award in select * from jsonb_array_elements(p_awards) loop
    update prediction_stakes
      set is_correct = (award->>'correct')::boolean,
          points_awarded = (award->>'mp_change')::integer,
          settled_at = now()
      where prediction_id = (award->>'prediction_id')::uuid
        and user_id = (award->>'user_id')::uuid;

    if (award->>'mp_change')::integer > 0 then
      perform apply_point_transaction(
        (award->>'user_id')::uuid,
        (award->>'mp_change')::integer,
        'prediction_win',
        (award->>'prediction_id')::uuid,
        jsonb_build_object('match_id', p_match_id)
      );
    end if;
  end loop;
end;
$$;

-- Auto-create profile + join the Official Season Room on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
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

  select id into v_official_room_id from rooms where slug = 'official-' || v_season;

  if v_official_room_id is null then
    insert into rooms (
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fan a new match out to every active season/community room (v3.0 §9.3).
create or replace function public.populate_season_room_matches()
returns trigger language plpgsql security definer as $$
begin
  insert into room_matches (room_id, match_id)
  select r.id, new.id
  from rooms r
  where r.room_type in ('season_league', 'community')
    and r.season = new.season
    and r.is_archived = false
  on conflict do nothing;
  return new;
end;
$$;

create trigger match_added_to_season_rooms
  after insert on matches
  for each row execute function public.populate_season_room_matches();

-- Fires the settlement pipeline when a full-time snapshot is inserted
-- (v5 §6.6 — replaces the v4.0 trigger on matches.status).
-- The project URL/service role key are read from Postgres settings that
-- the Supabase CLI configures locally via `supabase secrets set` /
-- project config — see supabase/config.toml and the README.
create or replace function public.on_full_time_snapshot()
returns trigger language plpgsql as $$
begin
  if new.checkpoint = 'full_time' then
    perform net.http_post(
      url := current_setting('app.settings.functions_url') || '/score-gameweek',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
      body := jsonb_build_object('match_id', new.match_id)
    );
    perform net.http_post(
      url := current_setting('app.settings.functions_url') || '/settle-predictions',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
      body := jsonb_build_object('match_id', new.match_id)
    );
  end if;
  return new;
end;
$$;

create trigger full_time_snapshot_trigger
  after insert on match_snapshots
  for each row execute function public.on_full_time_snapshot();

-- Flips expired open predictions to locked (v5 §6.4). Scheduled via
-- pg_cron every minute — see supabase/migrations/0002_cron.sql.
create or replace function public.lock_expired_predictions()
returns void language sql security definer as $$
  update predictions set status = 'locked'
  where status = 'open' and locks_at <= now();
$$;

-- ============================================================
-- Views
-- ============================================================

create or replace view world_rankings_top100 as
select
  rank() over (order by pb.balance desc) as rank,
  pb.user_id, p.username, p.display_name, p.avatar_url,
  pb.balance as points, p.favourite_team_id
from point_balances pb
join profiles p on p.id = pb.user_id
where pb.season = public.current_season()
order by pb.balance desc
limit 100;

create or replace view room_leaderboard as
select
  rms.room_id, rms.user_id, p.username, p.display_name, p.avatar_url,
  sum(rms.points_earned) as total_points,
  sum(rms.points_staked) as total_staked,
  sum(rms.points_won) as total_won,
  count(distinct rms.match_id) as matches_played,
  rank() over (partition by rms.room_id order by sum(rms.points_earned) desc) as rank
from room_match_scores rms
join profiles p on p.id = rms.user_id
group by rms.room_id, rms.user_id, p.username, p.display_name, p.avatar_url;

create or replace view room_match_leaderboard as
select
  ps.room_id, ps.prediction_id, p.match_id, ps.user_id,
  pr.username, pr.display_name, pr.avatar_url,
  sum(ps.stake) as points_staked,
  sum(coalesce(ps.points_awarded, 0)) as points_won,
  sum(coalesce(ps.points_awarded, 0)) - sum(ps.stake) as points_earned,
  rank() over (partition by ps.room_id, p.match_id
    order by sum(coalesce(ps.points_awarded, 0)) - sum(ps.stake) desc) as rank
from prediction_stakes ps
join predictions p on p.id = ps.prediction_id
join profiles pr on pr.id = ps.user_id
where ps.room_id is not null and ps.is_correct is not null
group by ps.room_id, ps.prediction_id, p.match_id, ps.user_id,
  pr.username, pr.display_name, pr.avatar_url;

create or replace view my_open_selections as
select
  ps.id, ps.prediction_id, ps.room_id,
  r.name as room_name, r.room_type,
  ps.answer, ps.stake, ps.odds_multiplier, ps.potential_payout,
  p.question, p.locks_at, p.phase,
  m.id as match_id, m.home_team_id, m.away_team_id, m.kickoff
from prediction_stakes ps
join predictions p on p.id = ps.prediction_id
join matches m on m.id = p.match_id
left join rooms r on r.id = ps.room_id
where ps.user_id = auth.uid() and ps.is_correct is null
order by p.locks_at asc;

create or replace view recommended_rooms as
select
  r.id, r.slug, r.name, r.description, r.room_code, r.room_type,
  r.season, r.is_official, r.is_pinned,
  (select count(*) from room_members where room_id = r.id) as member_count,
  (select count(*) from room_matches where room_id = r.id) as match_count,
  r.created_at
from rooms r
where r.is_archived = false
  and r.visibility = 'public'
  and r.room_type in ('season_league', 'match_public', 'community')
order by r.is_pinned desc, r.is_official desc, member_count desc, r.created_at desc;
