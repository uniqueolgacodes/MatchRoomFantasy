-- Age gate + ToS/Privacy acknowledgement, ahead of the onboarding
-- "age-consent" step. PRD §34.5 Regulatory Notes: an age gate is
-- listed as required before any use beyond friends-and-family
-- testing (13+ recommended, 18+ if any sponsored prize has monetary
-- value — the redemption catalog's sponsored_prize category does,
-- so this gate self-certifies 18+).
--
-- We deliberately store only a consent timestamp, not a date of
-- birth — a DOB is more personal data than the product needs to
-- collect just to self-certify an age threshold, and it never
-- becomes a value we'd have to protect, migrate, or justify holding.

alter table profiles add column if not exists age_confirmed_at timestamptz;

-- Mirrors the onboarding-completion gate in middleware.ts / PRD §9.2:
-- fast, indexed lookup for "has this user cleared the age gate".
create index if not exists profiles_age_confirmed_idx on profiles (age_confirmed_at)
  where age_confirmed_at is null;
