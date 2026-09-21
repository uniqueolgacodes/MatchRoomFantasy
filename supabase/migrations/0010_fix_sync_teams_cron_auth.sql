-- Fixes the sync-teams cron job created in 0008_sync_teams_cron.sql.
-- That migration used current_setting('app.settings.service_role_key')
-- for its net.http_post auth header — the pattern that turned out not
-- to work on hosted Supabase (the ALTER DATABASE attempt to set it
-- was rejected with a permission error, and never wrote a real
-- value). The other cron jobs that call Edge Functions were fixed
-- live in the SQL Editor at the time — switched to reading the
-- service role key from Supabase Vault, with the (non-sensitive)
-- functions URL hardcoded directly — but that fix was never captured
-- back into a migration file for this specific job, so it's been
-- failing silently every Monday since. This applies the same fix.
--
-- Replace <your-project-ref> below with your actual project ref
-- before running, matching what the other jobs already use.

select cron.unschedule('sync-teams');

select cron.schedule('sync-teams', '0 4 * * 1', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/sync-teams',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);
