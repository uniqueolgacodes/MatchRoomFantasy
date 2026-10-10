-- Notification system, Phase C: quiet hours.
--
-- Push is skipped (not delayed) while a person's quiet hours are
-- active. The notification row is still written, so it shows up in the
-- in-app bell either way; only the push is suppressed, and it is not
-- re-sent afterwards. A "send it when quiet hours end" queue would need
-- its own scheduled job and was left out on purpose.
--
-- Default is ON, 22:00-07:00. Virtual matches settle around the clock,
-- so without a default a win at 3am would push to every registered
-- device. People can turn it off or change the window in
-- /profile/settings. Change the defaults below if you would rather it
-- start off.

alter table profiles add column if not exists quiet_hours_enabled boolean not null default true;
alter table profiles add column if not exists quiet_hours_start time not null default '22:00';
alter table profiles add column if not exists quiet_hours_end time not null default '07:00';

-- Column-level grant, same convention as 0009/0020/0026/0029.
grant update (quiet_hours_enabled, quiet_hours_start, quiet_hours_end)
  on public.profiles to authenticated;

-- Same dispatcher as 0028 with one added step. Quiet hours are read in
-- the person's own profiles.timezone (default Africa/Lagos). A window
-- where start > end (22:00-07:00) crosses midnight and is handled; a
-- window where start = end is treated as "no window" rather than "all
-- day".
create or replace function public.dispatch_push_for_notification()
returns trigger language plpgsql as $$
declare
  v_push_enabled boolean;
  v_quiet_enabled boolean;
  v_quiet_start time;
  v_quiet_end time;
  v_tz text;
  v_local time;
  v_external_ids text[];
begin
  select notify_push_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone
    into v_push_enabled, v_quiet_enabled, v_quiet_start, v_quiet_end, v_tz
  from profiles where id = new.user_id;

  if not coalesce(v_push_enabled, true) then
    return new;
  end if;

  if coalesce(v_quiet_enabled, false)
     and v_quiet_start is not null and v_quiet_end is not null
     and v_quiet_start <> v_quiet_end then
    begin
      v_local := (now() at time zone coalesce(v_tz, 'Africa/Lagos'))::time;
    exception when others then
      -- an unrecognised time zone string should never block delivery
      v_local := (now() at time zone 'Africa/Lagos')::time;
    end;

    if (v_quiet_start < v_quiet_end and v_local >= v_quiet_start and v_local < v_quiet_end)
       or (v_quiet_start > v_quiet_end and (v_local >= v_quiet_start or v_local < v_quiet_end)) then
      return new; -- quiet hours: in-app only
    end if;
  end if;

  select array_agg(external_id) into v_external_ids
  from push_subscriptions
  where user_id = new.user_id and provider = 'onesignal';

  if v_external_ids is null or array_length(v_external_ids, 1) = 0 then
    return new; -- no registered device yet — in-app notification still lands fine
  end if;

  perform net.http_post(
    url := 'https://rmkpadixdmmbczmmulwn.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object(
      'external_ids', v_external_ids,
      'title', new.title,
      'body', new.body,
      'data', jsonb_build_object('deep_link', new.deep_link, 'notification_id', new.id)
    )
  );

  return new;
end;
$$;