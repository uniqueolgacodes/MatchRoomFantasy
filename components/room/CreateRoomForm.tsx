'use client';
// PRD §10.1 — creates a Public or Private Match Room via POST
// /api/rooms (create_room() RPC, migration 0013).
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MatchOption {
  id: string;
  label: string;
}

interface CreateRoomFormProps {
  matches: MatchOption[];
  preselectedMatchId?: string;
  preselectedLabel?: string;
}

export function CreateRoomForm({ matches, preselectedMatchId, preselectedLabel }: CreateRoomFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [matchId, setMatchId] = useState(preselectedMatchId ?? matches[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 3 && matchId && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          roomType: visibility === 'public' ? 'match_public' : 'private',
          matchId,
        }),
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
    <div>
      <div>
        <label className="text-xs font-medium text-white/50">Room name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. The Squad"
          className="mt-1.5 w-full rounded-lg bg-ink-soft px-4 py-3 outline-none focus:ring-2 focus:ring-pitch"
          autoFocus
        />
      </div>

      {preselectedMatchId ? (
        <div className="mt-4">
          <label className="text-xs font-medium text-white/50">Match</label>
          <p className="mt-1.5 rounded-lg bg-ink-soft px-4 py-3 text-sm text-white/80">{preselectedLabel}</p>
        </div>
      ) : matches.length > 0 ? (
        <div className="mt-4">
          <label className="text-xs font-medium text-white/50">Match</label>
          <select
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-ink-soft px-4 py-3 outline-none focus:ring-2 focus:ring-pitch"
          >
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-white/10 px-4 py-4 text-center text-sm text-white/40">
          No upcoming fixtures to attach a room to right now.
        </p>
      )}

      <div className="mt-4">
        <label className="text-xs font-medium text-white/50">Visibility</label>
        <div className="mt-1.5 flex gap-2">
          {(['public', 'private'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold capitalize transition-colors ${
                visibility === v ? 'bg-pitch text-white' : 'bg-ink-soft text-white/60 hover:bg-white/[0.07]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-white/30">
          {visibility === 'public' ? 'Anyone can find and join this room.' : "Only people with the room's code or link can join."}
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
      >
        {submitting ? 'Creating...' : 'Create room'}
      </button>
    </div>
  );
}
