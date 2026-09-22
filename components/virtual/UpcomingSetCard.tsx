'use client';
// One hourly set (2 matches, same kickoff). Both matches' prediction
// boards share the page-level balance (via balance/onBalanceChange
// on PredictionsBoard) so staking in one match's board updates what
// the other one displays too, rather than each drifting independently.
import { TeamBadge } from './TeamBadge';
import { Countdown } from './Countdown';
import { PredictionsBoard } from '@/components/room/PredictionsBoard';
import type { Market, StakeInfo } from '@/components/room/PredictionCard';

interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
}

interface UpcomingMatch {
  id: string;
  home: TeamInfo;
  away: TeamInfo;
  markets: Market[];
}

interface UpcomingSetCardProps {
  kickoff: string;
  matches: UpcomingMatch[];
  stakes: Record<string, StakeInfo>;
  balance: number;
  onBalanceChange: (balance: number) => void;
}

export function UpcomingSetCard({ kickoff, matches, stakes, balance, onBalanceChange }: UpcomingSetCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-soft p-5">
      <div className="flex items-center justify-between text-xs font-medium text-white/50">
        <span>Kicks off in</span>
        <span className="font-semibold text-pitch-light">
          <Countdown target={kickoff} />
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {matches.map((match) => (
          <div key={match.id}>
            <div className="flex items-center justify-center gap-3">
              <MiniTeam team={match.home} />
              <span className="text-xs text-white/30">vs</span>
              <MiniTeam team={match.away} />
            </div>
            <div className="mt-3">
              <PredictionsBoard
                roomId={null}
                markets={match.markets}
                initialBalance={balance}
                initialStakes={stakes}
                balance={balance}
                onBalanceChange={onBalanceChange}
                hideBalanceHeader
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTeam({ team }: { team: TeamInfo }) {
  return (
    <span className="flex items-center gap-1.5">
      <TeamBadge shortName={team.shortName} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="sm" />
      <span className="text-xs font-semibold text-white/80">{team.name}</span>
    </span>
  );
}
