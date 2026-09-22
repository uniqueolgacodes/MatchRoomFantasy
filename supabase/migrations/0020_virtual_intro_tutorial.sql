-- First-time virtual-match tutorial tracking. Same pattern as
-- age_confirmed_at: null means "hasn't seen it yet", set once,
-- never shown again.
--
-- This needs its own column-level grant, not just RLS — 0009
-- restricted profiles UPDATE to a specific column allow-list
-- (grant update (display_name, buddy_enabled, ...)), so without this
-- a client-side update to this column would fail even though the
-- row-level policy (auth.uid() = id) would otherwise allow it.
-- Matches the existing convention for harmless self-service
-- preference flags rather than introducing a new RPC for something
-- this low-stakes.

alter table profiles add column if not exists virtual_intro_seen_at timestamptz;

grant update (virtual_intro_seen_at) on public.profiles to authenticated;
