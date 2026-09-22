-- 0005_seed_teams.sql's own comment calls itself "2025-26 season
-- clubs", but the roster it actually seeded (Leicester, Southampton,
-- West Ham, Wolves included) is the 2024-25 lineup — a season out of
-- date even when it was written. Between then and the actual
-- 2026-27 season, three separate promotion/relegation cycles have
-- passed:
--   2024-25 -> 2025-26: Leicester, Ipswich, Southampton relegated;
--     Leeds United, Burnley, Sunderland promoted.
--   2025-26 -> 2026-27: West Ham, Wolverhampton Wanderers, Burnley
--     relegated; Coventry City, Ipswich Town (straight back up),
--     Hull City promoted.
--
-- Net effect on our 20-row seed: Leicester City, Southampton, West
-- Ham United, and Wolverhampton Wanderers are no longer in the
-- Premier League and were never replaced; Leeds United, Sunderland,
-- Coventry City, and Hull City are current clubs missing from the
-- table entirely. This is exactly why poll-fixtures has been
-- reporting "skipped: 8" — those are the fixtures involving these
-- four clubs, whose TLAs (and every name-alias fallback) simply
-- don't exist in `teams` to resolve against.
--
-- No matches reference the four outdated rows (poll-fixtures could
-- never have written one — football-data.org hasn't returned a
-- West Ham/Wolves/Leicester/Southampton Premier League fixture all
-- season), so deleting them is safe.
--
-- crest_url is left null for the four new rows on purpose: the
-- self-healing backfill in poll-fixtures (and sync-teams) already
-- checks for any team with a null crest_url and re-syncs from
-- football-data.org automatically on the very next run — no manual
-- step needed here.

delete from teams where id in ('leicester', 'southampton', 'west_ham', 'wolves');

insert into teams (id, name, short_name, league_id, keywords) values
  ('coventry', 'Coventry City', 'COV', 'epl', array['coventry', 'coventry city', 'sky blues']),
  ('hull', 'Hull City', 'HUL', 'epl', array['hull', 'hull city', 'tigers']),
  ('leeds', 'Leeds United', 'LEE', 'epl', array['leeds', 'leeds united', 'whites']),
  ('sunderland', 'Sunderland', 'SUN', 'epl', array['sunderland', 'black cats'])
on conflict (id) do nothing;
