-- Schedules open-pre-match-predictions alongside poll-fixtures (same
-- 6-hour cadence makes sense — check for newly-loaded fixtures that
-- need their prediction catalog opened). Zero football-data.org
-- calls involved, so no rate-limit interaction with the pollers.
--
-- Replace <your-project-ref> below with your actual project ref
-- before running, matching what the other jobs already use.

select cron.schedule('open-pre-match-predictions', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/open-pre-match-predictions',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);
