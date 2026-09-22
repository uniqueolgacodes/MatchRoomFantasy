// Small formatting helpers shared across feed/room UI. Kept
// dependency-free (no date-fns import for functions this simple) —
// every byte here ships to the client on any page that uses them.

/**
 * "Today, 16:30" / "Tomorrow, 15:00" / "Sat, 27 Sep, 15:00" — used
 * for fixture kickoff times. A bare weekday ("Sat, 15:00") reads
 * fine for the next few days but stops being useful once you're
 * looking more than a week out (which fixtures? which Saturday?),
 * so this always includes the actual date once it's not today or
 * tomorrow.
 */
export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, now)) return `Today, ${time}`;
  if (isSameDay(date, tomorrow)) return `Tomorrow, ${time}`;

  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/** "3h ago" / "2d ago" / "14 Sep" — used for news timestamps. */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
