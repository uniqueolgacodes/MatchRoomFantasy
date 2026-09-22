'use client';
// PRD §10.4 Room Codes & Invite Links. Hits the join-by-code route
// that already exists (join_room_by_code() RPC, migration 0009) —
// this page was the missing UI for it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinRoomPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (code.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      router.push(`/rooms/${data.room.id}`);
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-bold">Join a room</h1>
      <p className="mt-1 text-sm text-white/50">Enter the 6-character code someone shared with you.</p>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={12}
        placeholder="e.g. AB12CD"
        className="mt-6 w-full rounded-lg bg-ink-soft px-4 py-3 text-center text-lg font-semibold tracking-widest outline-none focus:ring-2 focus:ring-pitch"
        autoFocus
      />
      {error && <p className="mt-2 text-center text-sm text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={code.trim().length === 0 || submitting}
        className="mt-4 w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
      >
        {submitting ? 'Joining...' : 'Join room'}
      </button>
    </main>
  );
}
