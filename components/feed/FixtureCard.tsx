// PRD §28.1 components/feed/ — FixtureCard. Server-renderable (no
// 'use client'): purely presentational, so it costs nothing on the
// home feed beyond the HTML it outputs. next/image works fine from
// a server component — it's just markup, no client hook involved.
import Image from 'next/image';
import { formatKickoff } from '@/lib/utils/format';

interface FixtureCardProps {
  homeShortName: string;
  awayShortName: string;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
  kickoff: string;
  status: 'scheduled' | 'live' | 'half_time' | 'full_time' | 'postponed' | 'cancelled' | 'suspended';
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
}

export function FixtureCard({
  homeShortName,
  awayShortName,
  homeCrestUrl,
  awayCrestUrl,
  kickoff,
  status,
  homeScore,
  awayScore,
  minute,
}: FixtureCardProps) {
  const isLive = status === 'live' || status === 'half_time';
  const hasScore = homeScore !== null && awayScore !== null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-soft px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
        <TeamBadge shortName={homeShortName} crestUrl={homeCrestUrl} />
        <span className="shrink-0 text-xs text-white/30">vs</span>
        <TeamBadge shortName={awayShortName} crestUrl={awayCrestUrl} />
      </div>

      <div className="shrink-0 text-right">
        {hasScore ? (
          <p className="text-sm font-bold tabular-nums">
            {homeScore} – {awayScore}
          </p>
        ) : (
          <p className="text-xs text-white/50">{formatKickoff(kickoff)}</p>
        )}
        {isLive && (
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-medium text-floodlight">
            <span className="h-1.5 w-1.5 rounded-full bg-floodlight" />
            {status === 'half_time' ? 'Half-time' : minute ? `${minute}'` : 'Live'}
          </p>
        )}
      </div>
    </div>
  );
}

function TeamBadge({ shortName, crestUrl }: { shortName: string; crestUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {crestUrl ? (
        <Image src={crestUrl} alt={shortName} width={24} height={24} className="h-6 w-6 shrink-0 object-contain" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold">{shortName}</span>
      )}
      <span className="truncate text-xs font-semibold text-white/80">{shortName}</span>
    </span>
  );
}
