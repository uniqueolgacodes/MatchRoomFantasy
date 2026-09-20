'use client';
// PRD §9.2 Onboarding — step 3 (final). Favourite team is optional
// per the PRD, so this step never blocks — both buttons complete
// onboarding, one with a team set and one without. This is also the
// step that sets onboarding_completed_at, which is what the
// middleware's onboarding gate checks.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

interface Team {
  id: string;
  name: string;
  short_name: string;
}

export default function TeamsOnboardingPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const supabase = createClient();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name, short_name')
      .order('name')
      .then(({ data }) => setTeams(data ?? []));
  }, [supabase]);

  async function finish(teamId: string | null) {
    if (!user) return;
    setSubmitting(true);

    await supabase
      .from('profiles')
      .update({ favourite_team_id: teamId, onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);

    // Following your favourite team feeds the personalized Hub (PRD
    // §19.4) — this is a best-effort insert, not required to finish.
    if (teamId) {
      await supabase.from('user_teams').upsert({ user_id: user.id, team_id: teamId });
    }

    await refreshProfile();
    router.push('/');
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Follow your team</h1>
      <p className="mt-1 text-sm text-white/60">
        Optional — this personalizes your news feed and fixtures. You can change it later.
      </p>

      <div className="mt-6 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => setSelected(team.id)}
            className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
              selected === team.id
                ? 'border-pitch bg-pitch/10 text-white'
                : 'border-white/10 text-white/70 hover:border-white/30'
            }`}
          >
            {team.name}
          </button>
        ))}
      </div>

      <button
        onClick={() => finish(selected)}
        disabled={!selected || submitting}
        className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold disabled:opacity-40"
      >
        {submitting ? 'Finishing...' : 'Continue'}
      </button>
      <button
        onClick={() => finish(null)}
        disabled={submitting}
        className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80"
      >
        Skip for now
      </button>
    </>
  );
}
