// PRD §10.1. Fetches whatever CreateRoomForm needs to render — either
// the single preselected match's display label plus its day-siblings
// (for the "this match / whole day" toggle), or a dropdown of
// upcoming fixtures if someone lands here directly.
import { createClient } from '@/lib/supabase/server';
import { CreateRoomForm } from '@/components/room/CreateRoomForm';
import { formatKickoff } from '@/lib/utils/format';

export default async function NewRoomPage({ searchParams }: { searchParams: { matchId?: string } }) {
  const supabase = createClient();
  const matchId = searchParams.matchId;

  if (matchId) {
    const { data: match } = await supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, kickoff')
      .eq('id', matchId)
      .maybeSingle();

    if (match) {
      const kickoffDate = new Date(match.kickoff);
      const dayStart = new Date(Date.UTC(kickoffDate.getUTCFullYear(), kickoffDate.getUTCMonth(), kickoffDate.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const { data: dayMatches } = await supabase
        .from('matches')
        .select('id')
        .eq('is_virtual', false)
        .eq('status', 'scheduled')
        .gte('kickoff', dayStart.toISOString())
        .lt('kickoff', dayEnd.toISOString());

      const dayMatchIds = (dayMatches ?? []).map((m) => m.id);
      // Preselected match should always be included even if, by the
      // time this loads, its own status has moved past 'scheduled' —
      // rare, but better to include it than silently drop it.
      if (!dayMatchIds.includes(match.id)) dayMatchIds.push(match.id);

      const dayLabel = kickoffDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

      const { data: teams } = await supabase
        .from('teams')
        .select('id, short_name')
        .in('id', [match.home_team_id, match.away_team_id]);
      const home = teams?.find((t) => t.id === match.home_team_id)?.short_name ?? '?';
      const away = teams?.find((t) => t.id === match.away_team_id)?.short_name ?? '?';

      return (
        <main className="mx-auto max-w-md px-4 py-10">
          <h1 className="font-display text-2xl font-bold">Create a room</h1>
          <p className="mt-1 text-sm text-white/50">Get your squad predicting together before kickoff.</p>
          <div className="mt-6">
            <CreateRoomForm
              matches={[]}
              preselectedMatchId={match.id}
              preselectedLabel={`${home} vs ${away} — ${formatKickoff(match.kickoff)}`}
              dayMatchIds={dayMatchIds}
              dayLabel={dayLabel}
            />
          </div>
        </main>
      );
    }
  }

  const { data: upcoming } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff')
    .eq('is_virtual', false)
    .eq('status', 'scheduled')
    .order('kickoff', { ascending: true })
    .limit(20);

  const teamIds = Array.from(new Set((upcoming ?? []).flatMap((m) => [m.home_team_id, m.away_team_id])));
  const { data: teams } = teamIds.length > 0 ? await supabase.from('teams').select('id, short_name').in('id', teamIds) : { data: [] };
  const teamsById = new Map((teams ?? []).map((t) => [t.id, t.short_name]));

  const matches = (upcoming ?? []).map((m) => ({
    id: m.id,
    label: `${teamsById.get(m.home_team_id) ?? '?'} vs ${teamsById.get(m.away_team_id) ?? '?'} — ${formatKickoff(m.kickoff)}`,
  }));

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-bold">Create a room</h1>
      <p className="mt-1 text-sm text-white/50">Get your squad predicting together before kickoff.</p>
      <div className="mt-6">
        <CreateRoomForm matches={matches} />
      </div>
    </main>
  );
}
