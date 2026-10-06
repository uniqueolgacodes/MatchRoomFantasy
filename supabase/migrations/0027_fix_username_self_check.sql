-- Fixes: a user who already claimed a username, then refreshed
-- before finishing onboarding, couldn't re-submit their own username
-- on the restarted flow — is_username_available() didn't exclude the
-- caller's own existing row, so it reported their own name as
-- "taken" even though set_username() (the actual write path, just
-- below it in 0004_onboarding.sql) already correctly excludes self
-- via `id <> auth.uid()`. The two checks disagreed; this brings the
-- read-side check in line with the write-side one it's supposed to
-- be predicting.

create or replace function public.is_username_available(p_username text)
returns boolean language sql stable as $$
  select
    p_username ~ '^[a-z0-9_]{3,20}$'
    and lower(p_username) not in ('admin', 'administrator', 'support', 'help',
      'official', 'matchroom', 'system', 'root', 'moderator', 'mod')
    and not exists (
      select 1 from profiles
      where lower(username) = lower(p_username)
        and id <> auth.uid()
    );
$$;
