-- Weekly safety net for team crest/external_id backfill
-- (supabase/functions/sync-teams). poll-fixtures already self-heals
-- this whenever a team is missing crest_url, so this cron mostly
-- exists to catch a crest URL going stale or a team row being
-- re-seeded without one — not something that needs to run often.

select cron.schedule('sync-teams', '0 4 * * 1', $$
  select net.http_post(
    url := current_setting('app.settings.functions_url') || '/sync-teams',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
$$);
