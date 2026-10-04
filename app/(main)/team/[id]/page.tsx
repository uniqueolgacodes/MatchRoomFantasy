// PRD §21 Team Hub & News — this is aggregation, not new plumbing:
// matches, news_articles, and user_teams all already exist and
// already carry everything this page needs.
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FollowButton } from '@/components/team/FollowButton';
import { formatKickoff, timeAgo } from '@/lib/utils/format';

export default async function TeamHubPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, short_name, crest_url, primary_color, secondary_color')
    .eq('id', params.id)
    .maybeSingle();

  if (!team) notFound();

  const [{ data: following }, { data: upcoming }, { data: recent }, { data: news }] = await Promise.all([
    supabase.from('user_teams').select('team_id').eq('user_id', user.id).eq('team_id', team.id).maybeSingle(),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, kickoff')
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .eq('status', 'scheduled')
      .eq('is_virtual', false)
      .order('kickoff', { ascending: true })
      .limit(6),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, home_score, away_score, kickoff')
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .eq('status', 'full_time')
      .eq('is_virtual', false)
      .order('kickoff', { ascending: false })
      .limit(5),
    supabase
      .from('news_articles')
      .select('id, title, summary, url, source, published_at')
      .contains('team_ids', [team.id])
      .order('published_at', { ascending: false })
      .limit(6),
  ]);

  const opponentIds = new Set(
    [...(upcoming ?? []), ...(recent ?? [])].map((m) => (m.home_team_id === team.id ? m.away_team_id : m.home_team_id))
  );
  const { data: opponentTeams } = opponentIds.size > 0
    ? await supabase.from('teams').select('id, short_name, crest_url').in('id', Array.from(opponentIds))
    : { data: [] as { id: string; short_name: string; crest_url: string | null }[] };
  const opponentsById = new Map((opponentTeams ?? []).map((t) => [t.id, t]));

  const nextMatch = (upcoming ?? [])[0] ?? null;
  const laterFixtures = (upcoming ?? []).slice(1);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crest crestUrl={team.crest_url} shortName={team.short_name} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size="lg" />
          <h1 className="font-display text-2xl font-bold">{team.name}</h1>
        </div>
        <FollowButton teamId={team.id} userId={user.id} initialFollowing={!!following} />
      </div>

      {nextMatch && (
        <section className="mt-6 rounded-xl border border-white/10 bg-ink-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Next match</p>
          <div className="mt-2 flex items-center justify-between">
            <OpponentLine match={nextMatch} teamId={team.id} opponentsById={opponentsById} />
            <span className="text-sm text-white/50">{formatKickoff(nextMatch.kickoff)}</span>
          </div>
        </section>
      )}

      {recent && recent.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Recent form</h2>
          <div className="mt-3 flex gap-1.5">
            {recent.map((m) => (
              <FormBadge key={m.id} match={m} teamId={team.id} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-4 py-2.5 text-sm">
                <OpponentLine match={m} teamId={team.id} opponentsById={opponentsById} />
                <span className="font-semibold tabular-nums">
                  {m.home_team_id === team.id ? `${m.home_score}–${m.away_score}` : `${m.away_score}–${m.home_score}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {laterFixtures.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Upcoming fixtures</h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {laterFixtures.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-ink-soft px-4 py-2.5 text-sm">
                <OpponentLine match={m} teamId={team.id} opponentsById={opponentsById} />
                <span className="text-white/50">{formatKickoff(m.kickoff)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">News</h2>
        {news && news.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {news.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-ink-soft px-4 py-3 transition-colors hover:bg-white/[0.06]"
              >
                <p className="text-xs text-white/40">
                  {article.source} · {timeAgo(article.published_at)}
                </p>
                <p className="mt-1 text-sm font-semibold">{article.title}</p>
                {article.summary && <p className="mt-1 line-clamp-2 text-xs text-white/50">{article.summary}</p>}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            No recent news for {team.name}.
          </p>
        )}
      </section>
    </main>
  );
}

function OpponentLine({
  match,
  teamId,
  opponentsById,
}: {
  match: { home_team_id: string; away_team_id: string };
  teamId: string;
  opponentsById: Map<string, { id: string; short_name: string; crest_url: string | null }>;
}) {
  const isHome = match.home_team_id === teamId;
  const opponentId = isHome ? match.away_team_id : match.home_team_id;
  const opponent = opponentsById.get(opponentId);

  return (
    <span className="flex items-center gap-2">
      <Crest crestUrl={opponent?.crest_url ?? null} shortName={opponent?.short_name ?? '?'} size="sm" />
      <span className="font-medium">
        {isHome ? 'vs' : '@'} {opponent?.short_name ?? 'TBD'}
      </span>
    </span>
  );
}

function FormBadge({ match, teamId }: { match: { home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }; teamId: string }) {
  const isHome = match.home_team_id === teamId;
  const forTeam = isHome ? match.home_score : match.away_score;
  const against = isHome ? match.away_score : match.home_score;
  const result = forTeam! > against! ? 'W' : forTeam! < against! ? 'L' : 'D';
  const color = result === 'W' ? 'bg-pitch text-white' : result === 'L' ? 'bg-red-500/80 text-white' : 'bg-white/15 text-white/70';

  return <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${color}`}>{result}</span>;
}

function Crest({
  crestUrl,
  shortName,
  primaryColor,
  secondaryColor,
  size = 'sm',
}: {
  crestUrl: string | null;
  shortName: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  size?: 'sm' | 'lg';
}) {
  const dimension = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-6 w-6 text-[9px]';

  if (crestUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={crestUrl} alt="" className={`${dimension} shrink-0 rounded-full object-contain`} />;
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border font-bold ${dimension}`}
      style={{
        backgroundColor: primaryColor ?? '#374151',
        color: secondaryColor ?? '#ffffff',
        borderColor: (secondaryColor ?? '#ffffff') + '40',
      }}
    >
      {shortName}
    </span>
  );
}
