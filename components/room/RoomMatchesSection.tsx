'use client';
// Owns the one bit of state MatchAccordion's multiple boards need to
// share — current balance — so a stake placed on one match's board
// is reflected immediately on every other match's board in the same
// room, same reasoning as VirtualHub owning this for /virtual.
import { useState } from 'react';
import { MatchAccordion, type AccordionMatch } from './MatchAccordion';
import type { StakeInfo } from './PredictionCard';

interface RoomMatchesSectionProps {
  roomId: string;
  matches: AccordionMatch[];
  initialBalance: number;
  initialStakes: Record<string, StakeInfo>;
}

export function RoomMatchesSection({ roomId, matches, initialBalance, initialStakes }: RoomMatchesSectionProps) {
  const [balance, setBalance] = useState(initialBalance);

  return (
    <div>
      <div className="mb-2 flex justify-end text-xs font-medium text-white/50">
        Balance: <span className="ml-1 text-pitch-light">{balance} MP</span>
      </div>
      <MatchAccordion
        matches={matches}
        roomId={roomId}
        stakes={initialStakes}
        balance={balance}
        onBalanceChange={setBalance}
      />
    </div>
  );
}
