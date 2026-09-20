-- EPL team seed data (2025-26 season clubs). The onboarding team
-- picker and Team Hub both depend on this table having rows — it
-- was created by 0001_init.sql but never populated.
-- crest_url left null for now (no image hosting configured yet, and
-- none is required for this to function — the UI falls back to
-- initials/text). Add crest URLs later without needing a migration,
-- via a simple update statement.

insert into teams (id, name, short_name, league_id) values
  ('arsenal', 'Arsenal', 'ARS', 'epl'),
  ('aston_villa', 'Aston Villa', 'AVL', 'epl'),
  ('bournemouth', 'AFC Bournemouth', 'BOU', 'epl'),
  ('brentford', 'Brentford', 'BRE', 'epl'),
  ('brighton', 'Brighton & Hove Albion', 'BHA', 'epl'),
  ('chelsea', 'Chelsea', 'CHE', 'epl'),
  ('crystal_palace', 'Crystal Palace', 'CRY', 'epl'),
  ('everton', 'Everton', 'EVE', 'epl'),
  ('fulham', 'Fulham', 'FUL', 'epl'),
  ('ipswich', 'Ipswich Town', 'IPS', 'epl'),
  ('leicester', 'Leicester City', 'LEI', 'epl'),
  ('liverpool', 'Liverpool', 'LIV', 'epl'),
  ('man_city', 'Manchester City', 'MCI', 'epl'),
  ('man_united', 'Manchester United', 'MUN', 'epl'),
  ('newcastle', 'Newcastle United', 'NEW', 'epl'),
  ('nottingham_forest', 'Nottingham Forest', 'NFO', 'epl'),
  ('southampton', 'Southampton', 'SOU', 'epl'),
  ('tottenham', 'Tottenham Hotspur', 'TOT', 'epl'),
  ('west_ham', 'West Ham United', 'WHU', 'epl'),
  ('wolves', 'Wolverhampton Wanderers', 'WOL', 'epl')
on conflict (id) do nothing;
