-- supabase/migrations/0034_update_virtual_cron.sql
-- Update the spawner to run every 8 minutes to feed the continuous matchday loop
SELECT cron.unschedule('spawn-virtual-matches');
SELECT cron.schedule(
  'spawn-virtual-matches',
  '*/8 * * * *',
  $$
    SELECT net.http_post(
      url:=(current_setting('app.settings.functions_url') || '/spawn-virtual-matches'),
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
    ) as request_id;
  $$
);