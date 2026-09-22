'use client';
// Holds the one bit of state a page of predictions actually needs
// client-side (current balance, which markets are already predicted)
// so /match/[id] and /rooms/[id] can stay plain server components
// for everything else — this is the only client boundary either page
// needs.
import { useState } from 'react';
import { PredictionCard, type Market, type StakeInfo } from './PredictionCard';

interface PredictionsBoardProps {
  roomId: string | null;
  markets: Market[];
  initialBalance: number;
  initialStakes: Record<string, StakeInfo>;
}

export function PredictionsBoard({ roomId, markets, initialBalance, initialStakes }: PredictionsBoardProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [stakes, setStakes] = useState<Record<string, StakeInfo>>(initialStakes);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white/40">Predictions</h2>
        <span className="text-xs font-medium text-white/50">
          Balance: <span className="text-pitch-light">{balance} MP</span>
        </span>
      </div>

      {markets.length > 0 ? (
        <div className="flex flex-col gap-2">
          {markets.map((market) => (
            <PredictionCard
              key={market.id}
              market={market}
              roomId={roomId}
              existingStake={stakes[market.id] ?? null}
              onPlaced={(predictionId, stake, newBalance) => {
                setStakes((prev) => ({ ...prev, [predictionId]: stake }));
                setBalance(newBalance);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
          Predictions open closer to kickoff.
        </p>
      )}
    </div>
  );
}
