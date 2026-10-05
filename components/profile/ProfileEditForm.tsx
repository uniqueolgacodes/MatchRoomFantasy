'use client';
// Every field here updates a column already covered by 0009's
// "safe self-service writes" grant (display_name, favourite_team_id,
// buddy_enabled) — no new backend needed, just the UI that was
// missing.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TeamOption {
  id: string;
  name: string;
  short_name: string;
}

interface ProfileEditFormProps {
  userId: string;
  initialDisplayName: string;
  initialFavouriteTeamId: string | null;
  initialBuddyEnabled: boolean;
}

export function ProfileEditForm({ userId, initialDisplayName, initialFavouriteTeamId, initialBuddyEnabled }: ProfileEditFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [favouriteTeamId, setFavouriteTeamId] = useState(initialFavouriteTeamId ?? '');
  const [buddyEnabled, setBuddyEnabled] = useState(initialBuddyEnabled);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name, short_name')
      .eq('is_virtual', false)
      .order('name')
      .then(({ data }) => setTeams(data ?? []));
  }, [supabase]);

  const dirty =
    displayName.trim() !== initialDisplayName ||
    (favouriteTeamId || null) !== initialFavouriteTeamId ||
    buddyEnabled !== initialBuddyEnabled;

  async function save() {
    if (!dirty || displayName.trim().length === 0) return;
    setSaving(true);
    const teamId = favouriteTeamId || null;

    await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), favourite_team_id: teamId, buddy_enabled: buddyEnabled })
      .eq('id', userId);

    // Following your favourite team feeds the personalized Hub (PRD
    // §19.4) — best-effort, same as the onboarding step that first
    // set this.
    if (teamId) {
      await supabase.from('user_teams').upsert({ user_id: userId, team_id: teamId });
    }

    setSaving(false);
    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <div className="rounded-lg bg-ink-soft px-4 py-4">
      <div>
        <label className="text-xs font-medium text-white/50">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          className="mt-1.5 w-full rounded-lg bg-white/10 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pitch"
        />
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium text-white/50">Favourite team</label>
        <select
          value={favouriteTeamId}
          onChange={(e) => setFavouriteTeamId(e.target.value)}
          className="mt-1.5 w-full rounded-lg bg-white/10 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pitch"
        >
          <option value="">Not set</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium">Buddy enabled</span>
        <button
          onClick={() => setBuddyEnabled((v) => !v)}
          aria-pressed={buddyEnabled}
          className={`h-6 w-11 rounded-full transition-colors ${buddyEnabled ? 'bg-pitch' : 'bg-white/20'}`}
        >
          <span className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${buddyEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving || displayName.trim().length === 0}
        className="mt-4 w-full rounded-lg bg-pitch px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
      >
        {saving ? 'Saving...' : savedAt && !dirty ? 'Saved' : 'Save changes'}
      </button>
    </div>
  );
}
