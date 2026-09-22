// Virtual teams have no crest_url — they're fictional, there's no
// image source to sync from. Rather than leave a blank space or a
// generic placeholder, this renders each team's own primary/
// secondary color as a badge — doubles as a visual signal that
// distinguishes a virtual match from a real one at a glance.
// Pure presentational, no 'use client' needed.

interface TeamBadgeProps {
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  size?: 'sm' | 'md';
}

export function TeamBadge({ shortName, primaryColor, secondaryColor, size = 'md' }: TeamBadgeProps) {
  const dimension = size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-10 w-10 text-xs';

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border font-bold ${dimension}`}
      style={{ backgroundColor: primaryColor, color: secondaryColor, borderColor: secondaryColor + '40' }}
    >
      {shortName}
    </span>
  );
}
