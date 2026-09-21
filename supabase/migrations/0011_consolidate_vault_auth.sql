-- Consolidates the Vault-based auth fix into migration history.
-- 0001_init.sql's on_full_time_snapshot() and four of 0003_cron.sql's
-- jobs originally used current_setting('app.settings.functions_url'
-- / 'service_role_key') for their net.http_post calls. That setting
-- was never successfully set — the ALTER DATABASE attempt to set it
-- was rejected with a permission error on hosted Supabase, and the
-- fix (reading the service role key from Supabase Vault instead, with
-- the non-sensitive functions URL hardcoded) was applied directly in
-- the SQL Editor at the time rather than as a migration. The live
-- database has worked correctly since, but the migration files
-- didn't reflect it — this closes that gap so the repo can actually
-- reproduce the working state from scratch.
--
-- Replace <your-project-ref> in every url below with your actual
-- project ref before running.

create or replace function public.on_full_time_snapshot()
returns trigger language plpgsql as $$
declare
  v_key text;
begin
  if new.checkpoint = 'full_time' then
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

    perform net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/score-gameweek',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('match_id', new.match_id)
    );
    perform net.http_post(
      url := 'https://<your-project-ref>.supabase.co/functions/v1/settle-predictions',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('match_id', new.match_id)
    );
  end if;
  return new;
end;
$$;

select cron.unschedule('poll-fixtures');
select cron.schedule('poll-fixtures', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/poll-fixtures',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('poll-half-time-snapshots');
select cron.schedule('poll-half-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/poll-half-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('poll-full-time-snapshots');
select cron.schedule('poll-full-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/poll-full-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('ingest-news');
select cron.schedule('ingest-news', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/ingest-news',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

-- Note: the Vault secret itself (name = 'service_role_key') is NOT
-- created here, deliberately — that would mean committing a real
-- service role key into a file that gets pushed to GitHub, which is
-- exactly the kind of secret leak already caught once before. The
-- secret already exists in your project's Vault from the original
-- SQL Editor fix; this migration only depends on it, never creates
-- or contains it. If you ever rebuild against a brand-new Supabase
-- project, that one vault.create_secret(...) call needs to be run
-- manually in the SQL Editor first, with the new project's real key.
