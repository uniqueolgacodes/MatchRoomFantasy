-- Auth/onboarding support. Adds completion tracking so the app can
-- tell "signed up" apart from "finished onboarding", and moves
-- username validation server-side rather than trusting the client.

alter table profiles add column if not exists onboarding_completed_at timestamptz;

-- The original unique constraint on `username` is case-sensitive
-- (Postgres default), which would let "OlgaC" and "olgac" both
-- exist. Replace it with a case-insensitive unique index instead.
alter table profiles drop constraint if exists profiles_username_key;
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

-- A small reserved-word list so nobody claims an identity-adjacent
-- username. Not exhaustive — extend as needed.
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable as $$
  select
    p_username ~ '^[a-z0-9_]{3,20}$'
    and lower(p_username) not in ('admin', 'administrator', 'support', 'help',
      'official', 'matchroom', 'system', 'root', 'moderator', 'mod')
    and not exists (
      select 1 from profiles where lower(username) = lower(p_username)
    );
$$;

-- Claims a username for the calling user. Runs as the caller (not
-- security definer), so the existing "users update their own
-- profile" RLS policy still gates this — it can only ever touch
-- auth.uid()'s own row.
create or replace function public.set_username(p_username text)
returns void language plpgsql as $$
declare
  v_normalized text := lower(trim(p_username));
begin
  if v_normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters: letters, numbers, underscores only';
  end if;

  if v_normalized in ('admin', 'administrator', 'support', 'help',
    'official', 'matchroom', 'system', 'root', 'moderator', 'mod') then
    raise exception 'That username is reserved';
  end if;

  if exists (
    select 1 from profiles
    where lower(username) = v_normalized and id <> auth.uid()
  ) then
    raise exception 'That username is already taken';
  end if;

  update profiles set username = v_normalized, updated_at = now() where id = auth.uid();
end;
$$;
