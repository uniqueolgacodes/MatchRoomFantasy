-- Phase A of the notification system: a generalized notifications
-- table replacing the win-only win_notifications, plus a database-
-- level dispatcher so ANY future notification type gets push for
-- free the moment it's inserted — no future feature has to remember
-- to separately call send-push.
--
-- No new user-facing triggers in this migration. This is purely the
-- plumbing: registration-ready schema, a working dispatcher, and the
-- existing win-popup moved onto it so there's a real, working example
-- proving the pipeline end to end before anything else is built on it.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('win', 'reminder', 'room_activity', 'system')),
  title text not null,
  body text not null,
  deep_link text,
  metadata jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy "users read their own notifications"
  on notifications for select to authenticated using (auth.uid() = user_id);

create policy "users mark their own notifications read"
  on notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update (read_at) on public.notifications to authenticated;
-- No insert/delete grant for clients — only settle_predictions_batch
-- (service_role, via settle-predictions) and future server-side
-- triggers ever write here.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Migrate existing win_notifications data across before dropping it —
-- mp_amount folds into metadata since the new table is generalized
-- rather than win-specific. seen_at -> read_at (same meaning, clearer
-- name now that this isn't win-only).
insert into notifications (id, user_id, type, title, body, deep_link, metadata, read_at, created_at)
select
  id, user_id, 'win', 'You won!', 'Match Points earned',
  case when match_id is not null then '/match/' || match_id else null end,
  jsonb_build_object('mp_amount', mp_amount, 'prediction_id', prediction_id, 'match_id', match_id),
  seen_at, created_at
from win_notifications;

drop table win_notifications;

-- Re-point settlement at the new table. Same trigger point as
-- before (settle_predictions_batch, called from settle-predictions
-- for both real and virtual matches) — only the destination table
-- and column shape changed.
create or replace function public.settle_predictions_batch(
  p_match_id uuid,
  p_awards jsonb
) returns void language plpgsql as $$
declare
  award jsonb;
begin
  for award in select * from jsonb_array_elements(p_awards) loop
    update prediction_stakes
      set is_correct = (award->>'correct')::boolean,
          points_awarded = (award->>'mp_change')::integer,
          settled_at = now()
      where prediction_id = (award->>'prediction_id')::uuid
        and user_id = (award->>'user_id')::uuid;

    if (award->>'mp_change')::integer > 0 then
      perform apply_point_transaction(
        (award->>'user_id')::uuid,
        (award->>'mp_change')::integer,
        'prediction_win',
        (award->>'prediction_id')::uuid,
        jsonb_build_object('match_id', p_match_id)
      );

      insert into notifications (user_id, type, title, body, deep_link, metadata)
      values (
        (award->>'user_id')::uuid, 'win', 'You won!', 'Match Points earned',
        '/match/' || p_match_id,
        jsonb_build_object('mp_amount', (award->>'mp_change')::integer, 'prediction_id', award->>'prediction_id', 'match_id', p_match_id)
      );
    end if;
  end loop;
end;
$$;

-- The actual dispatcher: fires on every notification insert,
-- regardless of type or where it came from, so push delivery is
-- never something a future feature has to remember to wire up
-- separately. Respects the existing notify_push_enabled preference
-- and simply no-ops if the person has no registered device yet.
create or replace function public.dispatch_push_for_notification()
returns trigger language plpgsql as $$
declare
  v_push_enabled boolean;
  v_external_ids text[];
begin
  select notify_push_enabled into v_push_enabled from profiles where id = new.user_id;
  if not coalesce(v_push_enabled, true) then
    return new;
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

create trigger notifications_dispatch_push
  after insert on notifications
  for each row execute function public.dispatch_push_for_notification();
