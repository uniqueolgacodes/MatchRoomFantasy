-- supabase/migrations/0033_virtual_seasons.sql

-- 1. Track the overarching season
CREATE TABLE virtual_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number SERIAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    current_matchday INT NOT NULL DEFAULT 1 CHECK (current_matchday BETWEEN 1 AND 38),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Track team strengths for the season
CREATE TABLE virtual_team_stats (
    season_id UUID REFERENCES virtual_seasons(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
    base_strength NUMERIC NOT NULL,
    PRIMARY KEY (season_id, team_id)
);

-- 3. The 380-match schedule queue
CREATE TABLE virtual_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID REFERENCES virtual_seasons(id) ON DELETE CASCADE,
    matchday INT NOT NULL CHECK (matchday BETWEEN 1 AND 38),
    home_team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
    
    -- When the spawner picks this up, it will insert a real match into the `matches` 
    -- table and link the ID here. This lets us track what has spawned and what hasn't.
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL, 
    
    UNIQUE(season_id, home_team_id, away_team_id)
);

-- RLS Policies (Read-only for users, managed by edge functions)
ALTER TABLE virtual_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read virtual seasons" ON virtual_seasons FOR SELECT USING (true);
CREATE POLICY "Anyone can read virtual team stats" ON virtual_team_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can read virtual schedule" ON virtual_schedule FOR SELECT USING (true);