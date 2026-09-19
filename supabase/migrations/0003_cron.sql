-- Cron schedule per PRD v5 §6.5.
-- Requires the pg_cron and pg_net extensions, and app.settings.functions_url
-- / app.settings.service_role_key to be configured — see README "Cron setup".

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('poll-fixtures', '0 */6 * * *', $$
  select net.http_post(
    url := current_setting('app.settings.functions_url') || '/poll-fixtures',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
$$);

select cron.schedule('poll-half-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := current_setting('app.settings.functions_url') || '/poll-half-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
$$);

select cron.schedule('poll-full-time-snapshots', '*/5 * * * *', $$
  select net.http_post(
    url := current_setting('app.settings.functions_url') || '/poll-full-time-snapshots',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
$$);

select cron.schedule('lock-predictions', '* * * * *', $$
  select public.lock_expired_predictions();
$$);

select cron.schedule('ingest-news', '*/30 * * * *', $$
  select net.http_post(
    url := current_setting('app.settings.functions_url') || '/ingest-news',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
$$);

select cron.schedule('archive-expired-rooms', '*/15 * * * *', $$
  select public.archive_expired_rooms();
$$);

select cron.schedule('purge-stale-private-rooms', '0 3 * * *', $$
  select public.purge_stale_private_rooms();
$$);

select cron.schedule('season-rollover', '0 0 1 8 *', $$
  select public.rollover_season(
    extract(year from now())::text || '-' || (extract(year from now()) + 1)::text
  );
$$);

-- Room lifecycle functions referenced above (v3.0 §7.4 / v5 §10).

create or replace function public.archive_expired_rooms()
returns void language plpgsql security definer as $$
begin
  update rooms r
  set is_archived = true, archived_at = now()
  from room_matches rm, matches m
  where r.id = rm.room_id and rm.match_id = m.id
    and r.room_type = 'match_public'
    and m.status = 'full_time'
    and m.updated_at < now() - interval '3 hours'
    and r.is_archived = false;

  update rooms r
  set is_archived = true, archived_at = now()
  from room_matches rm, matches m
  where r.id = rm.room_id and rm.match_id = m.id
    and r.room_type = 'general'
    and m.kickoff < now() - interval '6 hours'
    and r.is_archived = false;
end;
$$;

create or replace function public.purge_stale_private_rooms()
returns void language plpgsql security definer as $$
declare
  v_stale_ids uuid[];
begin
  select array_agg(r.id) into v_stale_ids
  from rooms r
  join room_matches rm on rm.room_id = r.id
  join matches m on m.id = rm.match_id
  where r.room_type = 'private'
    and r.is_archived = false
    and m.status = 'full_time'
    and m.updated_at < now() - interval '14 days';

  if v_stale_ids is null then return; end if;

  update rooms set is_archived = true, archived_at = now() where id = any(v_stale_ids);
  delete from room_messages where room_id = any(v_stale_ids);
  delete from prediction_stakes
  where room_id = any(v_stale_ids)
    and prediction_id in (
      select id from predictions
      where match_id in (select match_id from room_matches where room_id = any(v_stale_ids))
    );
end;
$$;

create or replace function public.rollover_season(p_new_season text)
returns void language plpgsql security definer as $$
declare
  v_old_season text := public.current_season();
  v_top_balance integer;
  v_top_user_ids uuid[];
  v_top_count integer;
  v_share integer;
  v_rec record;
  v_bonus integer;
  v_new_balance integer;
begin
  select max(balance) into v_top_balance from point_balances where season = v_old_season;

  select array_agg(user_id), count(*)
  into v_top_user_ids, v_top_count
  from point_balances
  where season = v_old_season and balance = v_top_balance;

  v_share := case when v_top_count > 0 then 100 / v_top_count else 0 end;

  for v_rec in select user_id, balance from point_balances where season = v_old_season loop
    v_bonus := case when v_rec.user_id = any(v_top_user_ids) then v_share else 0 end;
    v_new_balance := 10 + v_bonus;

    insert into season_rollovers
      (user_id, from_season, to_season, final_balance, carryover_awarded, new_balance, was_top_ranked)
    values
      (v_rec.user_id, v_old_season, p_new_season, v_rec.balance, v_bonus, v_new_balance,
       v_rec.user_id = any(v_top_user_ids));

    insert into point_balances (user_id, season, balance, lifetime_earned)
    values (v_rec.user_id, p_new_season, v_new_balance, v_new_balance)
    on conflict (user_id, season) do nothing;

    if v_bonus > 0 then
      insert into point_transactions (user_id, amount, balance_after, reason, season, metadata)
      values (v_rec.user_id, v_bonus, v_new_balance, 'season_champion_bonus', p_new_season,
        jsonb_build_object('from_season', v_old_season, 'tied_count', v_top_count));
    end if;
  end loop;
end;
$$;
