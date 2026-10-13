'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EditMatchOption {
    id: string;
    label: string;
    isLocked: boolean; // True if match has started or finished
    isLinked: boolean; // True if it's currently in the room
}

interface EditRoomFormProps {
    roomId: string;
    matches: EditMatchOption[];
}

export function EditRoomForm({ roomId, matches }: EditRoomFormProps) {
    const router = useRouter();

    // Initialize selected IDs with everything currently linked
    const [selectedIds, setSelectedIds] = useState<string[]>(
        matches.filter((m) => m.isLinked).map((m) => m.id)
    );

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = selectedIds.length > 0 && selectedIds.length <= 20 && !submitting;

    function toggleMatch(match: EditMatchOption) {
        if (match.isLocked) return; // Cannot toggle matches that have already kicked off

        setSelectedIds((prev) =>
            prev.includes(match.id) ? prev.filter((id) => id !== match.id) : [...prev, match.id]
        );
    }

    async function handleSubmit() {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/rooms/${roomId}/matches`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matchIds: selectedIds }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong.');
                return;
            }
            router.push(`/rooms/${roomId}`);
            router.refresh();
        } catch {
            setError('Network error — try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            <div className="mt-6 flex max-h-96 flex-col gap-2 overflow-y-auto">
                {matches.map((m) => (
                    <label
                        key={m.id}
                        className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${m.isLocked
                                ? 'cursor-not-allowed bg-white/5 opacity-60'
                                : 'cursor-pointer bg-ink-soft hover:bg-white/[0.07]'
                            }`}
                    >
                        <div className="flex flex-1 items-center gap-3">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(m.id)}
                                onChange={() => toggleMatch(m)}
                                disabled={m.isLocked}
                                className="h-4 w-4 shrink-0 accent-pitch disabled:opacity-50"
                            />
                            <span className="leading-snug text-white/90">{m.label}</span>
                        </div>
                        {m.isLocked && (
                            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-white/30">
                                Locked
                            </span>
                        )}
                    </label>
                ))}
            </div>

            <p className="mt-3 text-xs text-white/40">
                {selectedIds.length === 0 ? 'You must select at least 1 match.' : `${selectedIds.length} match${selectedIds.length === 1 ? '' : 'es'} selected (Max 20)`}
            </p>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex gap-3">
                <button
                    onClick={() => router.push(`/rooms/${roomId}`)}
                    className="rounded-lg px-4 py-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="flex-1 rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
                >
                    {submitting ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}