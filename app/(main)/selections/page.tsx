// PRD §15.10 Open Selections View. my_open_selections (0001_init.sql)
// already filters to the caller's own unsettled stakes — this page
// was the missing UI for it. Closes the loop: predict from
// /match/[id] or a room, see it here until it settles.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatKickoff } from '@/lib/utils/format';

export default async function SelectionsPage() {
  const supabase = createClient();
  const { data: selections } = await supabase
    .from('my_open_selections')
    .select('id, room_id, room_name, room_type, answer, stake, odds_multiplier, potential_payout, question, locks_at, phase, match_id, home_team_id, away_team_id, kickoff');

  const teamIds = Array.from(new Set((selections ?? []).flatMap((s) => [s.home_team_id, s.away_team_id])));
  const { data: teams } = teamIds.length > 0 ? await supabase.from('teams').select('id, short_name').in('id', teamIds) : { data: [] };
  const teamsById = new Map((teams ?? []).map((t) => [t.id, t.short_name]));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">My Selections</h1>
      <p className="mt-1 text-sm text-white/50">Open predictions — settles automatically once the match finishes.</p>

      <div className="mt-6 flex flex-col gap-2">
        {(selections ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/match/${s.match_id}`}
            className="block rounded-lg bg-ink-soft px-4 py-3.5 transition-colors hover:bg-white/[0.07]"
          >
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>
                {teamsById.get(s.home_team_id) ?? '?'} vs {teamsById.get(s.away_team_id) ?? '?'}
              </span>
              <span>{formatKickoff(s.kickoff)}</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold">{s.question}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-sm text-pitch-light">
                Predicted "{s.answer}" — {s.stake} MP
              </p>
              <p className="text-xs text-white/40">
                {s.room_name ? s.room_name : 'Solo'} · pays {s.potential_payout} MP
              </p>
            </div>
          </Link>
        ))}
        {(!selections || selections.length === 0) && (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-white/40">No open predictions yet.</p>
            <Link href="/" className="mt-2 inline-block text-sm font-semibold text-pitch-light hover:text-pitch">
              Browse fixtures →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
