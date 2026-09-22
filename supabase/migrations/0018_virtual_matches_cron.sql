-- Schedules the two virtual match engine functions. Real project
-- ref hardcoded directly this time — 0015_fix_project_ref_placeholders
-- .sql already caught the cost of leaving <your-project-ref> as a
-- literal placeholder in a migration file, so that mistake isn't
-- worth repeating here.

select cron.schedule('spawn-virtual-matches', '0 * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/spawn-virtual-matches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);

select cron.schedule('advance-virtual-matches', '* * * * *', $$
  select net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/advance-virtual-matches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
  );
$$);
