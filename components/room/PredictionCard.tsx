'use client';
// PRD §15 — a single pre-match market. Fixed-option markets (winner,
// BTTS, over/under, clean sheets) render as pick buttons;
// correct_score has no fixed options (open-pre-match-predictions
// creates it with `options: []` on purpose — it's a free-text "N-N"
// guess) so it renders two number inputs instead.
import { useState } from 'react';
import { POINTS } from '@/lib/points/constants';

export interface Market {
  id: string;
  question: string;
  category: string;
  options: string[];
  odds_multiplier: number;
  locks_at: string;
}

export interface StakeInfo {
  answer: string;
  stake: number;
}

interface PredictionCardProps {
  market: Market;
  roomId: string | null;
  existingStake: StakeInfo | null;
  onPlaced: (predictionId: string, stake: StakeInfo, balance: number) => void;
}

export function PredictionCard({ market, roomId, existingStake, onPlaced }: PredictionCardProps) {
  const isCorrectScore = market.category === 'correct_score';
  const [selected, setSelected] = useState('');
  const [homeGoals, setHomeGoals] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [stakeAmount, setStakeAmount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = isCorrectScore ? (homeGoals !== '' && awayGoals !== '' ? `${homeGoals}-${awayGoals}` : '') : selected;
  const locked = new Date(market.locks_at) <= new Date();

  async function submit() {
    if (!answer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/predictions/stake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: market.id, answer, stake: stakeAmount, roomId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      onPlaced(market.id, { answer: data.stake.answer, stake: data.stake.stake }, data.balance);
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (existingStake) {
    return (
      <div className="rounded-lg bg-ink-soft px-4 py-3.5">
        <p className="text-sm font-semibold">{market.question}</p>
        <p className="mt-1.5 text-sm text-pitch-light">
          ✓ Predicted "{existingStake.answer}" — {existingStake.stake} MP
        </p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="rounded-lg bg-ink-soft px-4 py-3.5 opacity-50">
        <p className="text-sm font-semibold">{market.question}</p>
        <p className="mt-1.5 text-xs text-white/40">Locked</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-ink-soft px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{market.question}</p>
        <span className="shrink-0 text-xs font-medium text-white/40">{market.odds_multiplier}x</span>
      </div>

      <div className="mt-3">
        {isCorrectScore ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={20}
              value={homeGoals}
              onChange={(e) => setHomeGoals(e.target.value)}
              placeholder="0"
              className="w-16 rounded-md bg-white/10 px-2 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-pitch"
            />
            <span className="text-white/40">–</span>
            <input
              type="number"
              min={0}
              max={20}
              value={awayGoals}
              onChange={(e) => setAwayGoals(e.target.value)}
              placeholder="0"
              className="w-16 rounded-md bg-white/10 px-2 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-pitch"
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {market.options.map((opt) => (
              <button
                key={opt}
                onClick={() => setSelected(opt)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  selected === opt ? 'bg-pitch text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={POINTS.MIN_STAKE}
          max={POINTS.MAX_STAKE}
          value={stakeAmount}
          onChange={(e) =>
            setStakeAmount(Math.max(POINTS.MIN_STAKE, Math.min(POINTS.MAX_STAKE, Number(e.target.value) || POINTS.MIN_STAKE)))
          }
          className="w-16 rounded-md bg-white/10 px-2 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-pitch"
        />
        <span className="text-xs text-white/40">MP</span>
        <button
          onClick={submit}
          disabled={!answer || submitting}
          className="ml-auto rounded-md bg-pitch px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
        >
          {submitting ? 'Predicting...' : 'Predict'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
