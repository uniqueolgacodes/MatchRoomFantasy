-- Win notifications — powers the "you won" popup (Phase 4).
--
-- Every winning settlement inserts one row here, in the SAME
-- transaction as the MP award itself (settle_predictions_batch,
-- extended below) — a notification can never exist without its MP
-- having actually landed, and vice versa.
--
-- This benefits real matches too, not just virtual ones: both
-- settle-predictions (real) and the virtual pipeline call this exact
-- same RPC, so one change here covers both without touching either
-- Edge Function.

create table win_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mp_amount integer not null,
  prediction_id uuid references predictions(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_win_notifications_user on win_notifications (user_id, created_at desc);

alter table win_notifications enable row level security;

-- This policy does double duty: it's the actual security boundary,
-- and it's also what makes Realtime deliver these rows only to the
-- right person — Supabase Realtime evaluates RLS per subscriber for
-- postgres_changes, same mechanism already relied on for the virtual
-- match live ticker.
create policy "users read their own win notifications"
  on win_notifications for select to authenticated using (auth.uid() = user_id);

-- Only settle_predictions_batch writes here, running as service_role
-- inside the settle-predictions Edge Function — no client grant.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'win_notifications'
  ) then
    alter publication supabase_realtime add table public.win_notifications;
  end if;
end $$;

-- Re-create with the notification insert added right alongside the
-- existing MP award call — same loop, same transaction, no new
-- moving parts. Grants on this function are unaffected: CREATE OR
-- REPLACE preserves existing grants for an unchanged signature, so
-- the service_role-only execute grant from 0009 still applies as-is.
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

      insert into win_notifications (user_id, mp_amount, prediction_id, match_id)
      values (
        (award->>'user_id')::uuid,
        (award->>'mp_change')::integer,
        (award->>'prediction_id')::uuid,
        p_match_id
      );
    end if;
  end loop;
end;
$$;
