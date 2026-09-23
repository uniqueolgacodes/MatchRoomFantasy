-- Matches the cadence change in spawn-virtual-matches (10-minute
-- matches, 10-minute gap, 3 sets/hour = 6 matches/hour, up from 2/hour).
-- advance-virtual-matches' cron is unchanged — it already runs every
-- minute regardless of match duration, that's just its tick rate.

select cron.unschedule('spawn-virtual-matches');
select cron.schedule('spawn-virtual-matches', '0,20,40 * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/spawn-virtual-matches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);
