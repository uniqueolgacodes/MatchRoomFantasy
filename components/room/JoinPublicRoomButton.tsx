'use client';
// PRD §10.4. Private rooms only join by code (see /rooms/join) — this
// is for a public room someone lands on directly (from Discover, or
// a shared /rooms/[id] link) without being a member yet.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function JoinPublicRoomButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setError(null);
    const { error } = await supabase.rpc('join_public_room', { p_room_id: roomId });
    if (error) {
      setError("Couldn't join this room — try again.");
      setJoining(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={join}
        disabled={joining}
        className="w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
      >
        {joining ? 'Joining...' : 'Join room'}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
