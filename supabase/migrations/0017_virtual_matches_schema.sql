-- Virtual match simulator — Phase 1 (engine only, no new UI).
--
-- Design: a virtual match is an ordinary `matches` row with
-- is_virtual = true. Nothing downstream (predictions, staking,
-- settle-predictions, settle-room-match, score-gameweek,
-- leaderboards) checks where a match came from — so the entire
-- existing pipeline runs on virtual matches untouched. The only
-- places that need to actively know about the flag are the two new
-- functions this migration supports (spawn/advance) and the real
-- checkpoint pollers, which must skip virtual matches rather than
-- try to fetch them from football-data.org.

alter table teams add column if not exists is_virtual boolean not null default false;
alter table matches add column if not exists is_virtual boolean not null default false;

-- The planned event script for a virtual match: 8 ticks, each with a
-- scheduled offset (seconds from kickoff) and an event type/team.
-- Generated once at spawn time and stored, not computed live — Edge
-- Functions are stateless between invocations, so "what happens at
-- minute 6" has to live in the row, not in code, for a cron-driven
-- advancer to pick up correctly on every tick regardless of which
-- invocation actually processes it.
alter table matches add column if not exists virtual_script jsonb;

-- Real fixtures get their external_id from football-data.org
-- (always a positive integer). Virtual matches have no such ID, but
-- the column is `unique not null` — this sequence produces negative
-- integers so virtual matches satisfy that constraint while being
-- structurally impossible to collide with a real fixture ID, ever,
-- and are recognizable as virtual from external_id alone as a bonus.
create sequence if not exists virtual_match_external_id_seq;

-- Only the checkpoint pollers need to filter virtual matches out;
-- everything else (home feed, match page, room creation, staking)
-- already works off match_id alone and needs no changes.
create index if not exists idx_matches_is_virtual on matches (is_virtual, status);

-- Fictional virtual club roster. Deliberately not real EPL clubs —
-- see the design discussion: algorithmically-fabricated results with
-- real Match Points riding on them sit differently when attributed
-- to real clubs than to a made-up one, and it's more fun to have
-- full creative freedom on names/colors anyway.
insert into teams (id, name, short_name, league_id, is_virtual, primary_color, secondary_color) values
  ('ironclad_rovers',   'Ironclad Rovers',   'IRO', 'virtual', true, '#4b5563', '#111827'),
  ('solar_athletic',    'Solar Athletic',    'SOL', 'virtual', true, '#f59e0b', '#78350f'),
  ('northgate_united',  'Northgate United',  'NGT', 'virtual', true, '#1e3a8a', '#ffffff'),
  ('vantage_fc',        'Vantage FC',        'VAN', 'virtual', true, '#7c3aed', '#0d9488'),
  ('crimson_forge',     'Crimson Forge',     'CRI', 'virtual', true, '#991b1b', '#111827'),
  ('wavecrest_town',    'Wavecrest Town',    'WAV', 'virtual', true, '#0891b2', '#ffffff'),
  ('obsidian_city',     'Obsidian City',     'OBS', 'virtual', true, '#000000', '#eab308'),
  ('meridian_rangers',  'Meridian Rangers',  'MER', 'virtual', true, '#16a34a', '#9ca3af')
on conflict (id) do nothing;

-- Trivial helper so the spawn function doesn't need raw SQL access
-- to the sequence — just an RPC call returning the next negative id.
-- Not security-sensitive (only produces an integer), so no grant
-- restrictions needed beyond the defaults.
create or replace function public.next_virtual_external_id()
returns integer language sql as $$
  select (-1 * nextval('virtual_match_external_id_seq'))::integer;
$$;
