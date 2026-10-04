'use client';
// user_teams already has full insert/delete grants + RLS scoping to
// the caller's own rows (0009_security_hardening.sql), so this is a
// plain client-side toggle — no new backend work needed.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

interface FollowButtonProps {
  teamId: string;
  userId: string;
  initialFollowing: boolean;
}

export function FollowButton({ teamId, userId, initialFollowing }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function toggle() {
    setBusy(true);
    const supabase = createClient();

    if (following) {
      const { error } = await supabase.from('user_teams').delete().eq('user_id', userId).eq('team_id', teamId);
      if (error) {
        toast.error('Could not unfollow — try again.');
      } else {
        setFollowing(false);
      }
    } else {
      const { error } = await supabase.from('user_teams').insert({ user_id: userId, team_id: teamId });
      if (error) {
        toast.error('Could not follow — try again.');
      } else {
        setFollowing(true);
      }
    }
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        following ? 'bg-white/10 text-white/70 hover:bg-white/15' : 'bg-pitch text-white hover:bg-pitch-dark'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
