-- Enables Supabase Realtime (postgres_changes) on the two tables
-- LiveMatchCard subscribes to. This is easy to miss: a
-- postgres_changes subscription to a table not in this publication
-- doesn't error — it just never receives anything, silently. Wrapped
-- in existence checks so this is safe to run even if either table
-- was somehow already added.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $$;
