// PRD §16.2 — world_rankings_top100 already does the ranking and the
// season scoping; this is the missing UI for it, same shape as
// /selections. The view is pre-secured (0009_security_hardening.sql
// granted authenticated select on it directly), so this is a
// straightforward query-and-render page.
import { createClient } from '@/lib/supabase/server';

export default async function WorldRankingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const { data: rankings } = await supabase
    .from('world_rankings_top100')
    .select('rank, user_id, username, display_name, avatar_url, points');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">World Rankings</h1>
      <p className="mt-1 text-sm text-white/50">Top 100 by Match Points this season.</p>

      <div className="mt-6 flex flex-col gap-1">
        {(rankings ?? []).map((row) => {
          const isMe = row.user_id === user.id;
          return (
            <div
              key={row.user_id}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 ${
                isMe ? 'bg-pitch/15 ring-1 ring-pitch/40' : 'bg-ink-soft'
              }`}
            >
              <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-white/40">
                {row.rank}
              </span>
              <Avatar avatarUrl={row.avatar_url} label={row.display_name ?? row.username} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.display_name ?? row.username}
                  {isMe && <span className="ml-1.5 text-xs font-normal text-pitch-light">(you)</span>}
                </p>
                <p className="truncate text-xs text-white/40">@{row.username}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-pitch-light">{row.points} MP</span>
            </div>
          );
        })}

        {(!rankings || rankings.length === 0) && (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-white/40">Rankings will appear once the season gets underway.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Avatar({ avatarUrl, label }: { avatarUrl: string | null; label: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pitch/20 text-sm font-bold text-pitch-light">
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
