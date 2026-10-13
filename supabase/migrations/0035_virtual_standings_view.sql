-- supabase/migrations/0035_virtual_standings_view.sql

CREATE OR REPLACE VIEW virtual_standings AS
WITH active_season AS (
    SELECT season_number FROM virtual_seasons WHERE status = 'active' LIMIT 1
),
team_matches AS (
    SELECT 
        m.season,
        m.kickoff,
        t.id AS team_id,
        CASE WHEN m.home_team_id = t.id THEN m.home_score ELSE m.away_score END AS goals_for,
        CASE WHEN m.home_team_id = t.id THEN m.away_score ELSE m.home_score END AS goals_against,
        CASE 
            WHEN (m.home_team_id = t.id AND m.home_score > m.away_score) OR (m.away_team_id = t.id AND m.away_score > m.home_score) THEN 'W'
            WHEN m.home_score = m.away_score THEN 'D'
            ELSE 'L'
        END as result
    FROM matches m
    JOIN active_season ac ON m.season = 'Virtual-S' || ac.season_number
    JOIN teams t ON t.id = m.home_team_id OR t.id = m.away_team_id
    WHERE m.is_virtual = true AND m.status = 'full_time'
),
team_stats AS (
    SELECT 
        team_id,
        COUNT(*) AS played,
        COUNT(*) FILTER (WHERE result = 'W') AS won,
        COUNT(*) FILTER (WHERE result = 'D') AS drawn,
        COUNT(*) FILTER (WHERE result = 'L') AS lost,
        SUM(goals_for) AS goals_for,
        SUM(goals_against) AS goals_against,
        SUM(goals_for) - SUM(goals_against) AS goal_difference,
        (COUNT(*) FILTER (WHERE result = 'W') * 3) + (COUNT(*) FILTER (WHERE result = 'D') * 1) AS points
    FROM team_matches
    GROUP BY team_id
),
team_form AS (
    SELECT 
        team_id,
        (array_agg(result ORDER BY kickoff DESC))[1:5] AS form
    FROM team_matches
    GROUP BY team_id
)
SELECT 
    t.id AS team_id,
    t.name,
    t.short_name,
    t.primary_color,
    t.secondary_color,
    COALESCE(ts.played, 0)::int AS played,
    COALESCE(ts.won, 0)::int AS won,
    COALESCE(ts.drawn, 0)::int AS drawn,
    COALESCE(ts.lost, 0)::int AS lost,
    COALESCE(ts.goals_for, 0)::int AS goals_for,
    COALESCE(ts.goals_against, 0)::int AS goals_against,
    COALESCE(ts.goal_difference, 0)::int AS goal_difference,
    COALESCE(ts.points, 0)::int AS points,
    COALESCE(tf.form, ARRAY[]::text[]) AS form
FROM teams t
LEFT JOIN team_stats ts ON t.id = ts.team_id
LEFT JOIN team_form tf ON t.id = tf.team_id
WHERE t.is_virtual = true;

-- Grant access so the frontend can query it directly
GRANT SELECT ON virtual_standings TO anon, authenticated, service_role;