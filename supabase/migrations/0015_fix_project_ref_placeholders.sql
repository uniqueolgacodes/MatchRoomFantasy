-- Fixes the actual root cause of "fixtures never populate on their
-- own" (poll-fixtures works fine when invoked directly — confirmed
-- 12 upserted via manual curl — but its cron job has been failing
-- every run with `ERROR: invalid URL "https://<your-project-ref>...":
-- Bad hostname`).
--
-- 0010_fix_sync_teams_cron_auth.sql, 0011_consolidate_vault_auth.sql,
-- and 0012_predictions_cron.sql all left `<your-project-ref>` as a
-- literal placeholder in their net.http_post URLs, with a comment
-- saying to replace it before running — but `supabase db push`
-- applies a migration file's contents exactly as written, so it went
-- in unresolved. Every scheduled job since has been POSTing to a
-- hostname that doesn't exist, and failing before the request ever
-- reaches the function.
--
-- This migration hardcodes the real project ref
-- (rmkpadixdmmbczmmulwn) into every URL that had the placeholder —
-- the on_full_time_snapshot() trigger function body, and all six
-- affected cron jobs. Nothing else about their logic changes.

create or replace function public.on_full_time_snapshot()
returns trigger language plpgsql as $$
declare
  v_key text;
begin
  if new.checkpoint = 'full_time' then
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

    perform net.http_post(
      url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/score-gameweek',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('match_id', new.match_id)
    );
    perform net.http_post(
      url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/settle-predictions',
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
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/poll-fixtures',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('poll-half-time-snapshots');
select cron.schedule('poll-half-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/poll-half-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('poll-full-time-snapshots');
select cron.schedule('poll-full-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/poll-full-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('ingest-news');
select cron.schedule('ingest-news', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/ingest-news',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('sync-teams');
select cron.schedule('sync-teams', '0 4 * * 1', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/sync-teams',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.unschedule('open-pre-match-predictions');
select cron.schedule('open-pre-match-predictions', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/open-pre-match-predictions',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

-- Sanity check after applying — every command below should now show
-- your real project ref, not the placeholder:
--   select jobname, command from cron.job order by jobname;
