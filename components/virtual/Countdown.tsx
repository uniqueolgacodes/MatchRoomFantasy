'use client';
// A simple live countdown to a kickoff timestamp. Ticks once a
// second via setInterval — cheap enough that this doesn't need to be
// smarter than that for a handful of cards on one page.
//
// The initial value is deliberately NOT computed from Date.now() —
// that ran once during server render and again during the client's
// initial hydration render, moments apart (network latency in
// between), producing two different strings for the same render
// pass ("5:44" on the server vs "5:42" on the client) and tripping
// React's hydration mismatch check. Starting from a fixed,
// clock-independent placeholder means the server HTML and the
// client's first render are byte-identical; the real, ticking value
// is only ever set in useEffect, which runs after hydration has
// already succeeded, so nothing there needs to match anything.
import { useEffect, useState } from 'react';

export function Countdown({ target }: { target: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatRemaining(target));
    const interval = setInterval(() => setLabel(formatRemaining(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  // '—:—' renders identically on the server and the client's first
  // pass; useEffect swaps in the real value right after mount.
  return <span className="tabular-nums">{label ?? '—:—'}</span>;
}

function formatRemaining(target: string): string {
  const diffMs = new Date(target).getTime() - Date.now();
  if (diffMs <= 0) return 'kicking off...';

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
