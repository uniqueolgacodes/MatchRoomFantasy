-- Fixes: a win settled while the person was offline updated their
-- balance (settlement doesn't care whether anyone's connected) but
-- never showed the trophy popup, even after they came back — the
-- popup only ever listened for live postgres_changes INSERTs, which
-- Realtime doesn't replay to a client that wasn't connected at the
-- time. This adds the "have they actually seen this" tracking that
-- lets the client also catch up on anything it missed.

alter table win_notifications add column if not exists seen_at timestamptz;

-- Same shape as 0020's profiles.virtual_intro_seen_at fix: RLS policy
-- plus its own column-level grant, scoped to the person marking only
-- their own rows.
create policy "users mark their own win notifications seen"
  on win_notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update (seen_at) on public.win_notifications to authenticated;
