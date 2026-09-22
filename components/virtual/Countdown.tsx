'use client';
// A simple live countdown to a kickoff timestamp. Ticks once a
// second via setInterval — cheap enough that this doesn't need to be
// smarter than that for a handful of cards on one page.
import { useEffect, useState } from 'react';

export function Countdown({ target }: { target: string }) {
  const [label, setLabel] = useState(() => formatRemaining(target));

  useEffect(() => {
    const interval = setInterval(() => setLabel(formatRemaining(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  return <span className="tabular-nums">{label}</span>;
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
