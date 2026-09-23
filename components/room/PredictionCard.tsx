'use client';
// PRD §15 — a single pre-match market. Fixed-option markets (winner,
// BTTS, over/under, clean sheets) render as pick buttons, each now
// showing its OWN odds rather than one badge for the whole market;
// correct_score has no fixed options (open-pre-match-predictions /
// spawn-virtual-matches both create it with `options: []` on
// purpose — it's a free-text "N-N" guess) so it renders two number
// inputs, with a live price for whatever score is currently entered.
//
// options normalization: real matches (open-pre-match-predictions)
// still produce plain strings, e.g. ['home','away','draw'], with one
// flat odds_multiplier for the whole market — that's the original,
// simpler format. Virtual matches (spawn-virtual-matches) produce
// richer objects, e.g. [{key:'home', label:'Home Win', odds:2.1}],
// with real per-option pricing. normalizeOptions() below accepts
// either shape and always returns the richer one — a plain string
// just becomes {key: str, label: capitalized str, odds: the market's
// flat odds_multiplier} — so this component only ever has one shape
// to render, and a real match's card looks and behaves exactly as it
// did before any of this existed.
import { useState } from 'react';
import { POINTS } from '@/lib/points/constants';

export interface Market {
  id: string;
  question: string;
  category: string;
  options: Array<string | { key: string; label?: string; odds?: number }>;
  odds_multiplier: number;
  locks_at: string;
  /** correct_score only — per-scoreline prices, e.g. {"1-0": 6.4, "2-1": 9.8, ...}. Undefined for real matches (flat pricing only). */
  scoreOddsTable?: Record<string, number>;
  /** correct_score only — price for any scoreline outside scoreOddsTable. */
  otherScoreOdds?: number;
}

export interface StakeInfo {
  answer: string;
  stake: number;
}

interface NormalizedOption {
  key: string;
  label: string;
  odds: number;
}

function normalizeOptions(market: Market): NormalizedOption[] {
  return market.options.map((o) => {
    if (typeof o === 'string') {
      return { key: o, label: capitalize(o), odds: market.odds_multiplier };
    }
    return { key: o.key, label: o.label ?? capitalize(o.key), odds: o.odds ?? market.odds_multiplier };
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface PredictionCardProps {
  market: Market;
  roomId: string | null;
  existingStake: StakeInfo | null;
  onPlaced: (predictionId: string, stake: StakeInfo, balance: number) => void;
}

export function PredictionCard({ market, roomId, existingStake, onPlaced }: PredictionCardProps) {
  const isCorrectScore = market.category === 'correct_score';
  const options = normalizeOptions(market);

  const [selected, setSelected] = useState('');
  const [homeGoals, setHomeGoals] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [stakeAmount, setStakeAmount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreKey = homeGoals !== '' && awayGoals !== '' ? `${homeGoals}-${awayGoals}` : null;
  const liveScoreOdds = scoreKey ? market.scoreOddsTable?.[scoreKey] ?? market.otherScoreOdds ?? market.odds_multiplier : null;

  const answer = isCorrectScore ? (scoreKey ?? '') : selected;
  const selectedOdds = isCorrectScore ? liveScoreOdds : options.find((o) => o.key === selected)?.odds ?? null;
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
      <p className="text-sm font-semibold">{market.question}</p>

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
            {liveScoreOdds && (
              <span className="ml-1 rounded-md bg-pitch/15 px-2 py-1 text-xs font-semibold text-pitch-light">{liveScoreOdds}x</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  selected === opt.key ? 'bg-pitch text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {opt.label}
                <span className={selected === opt.key ? 'text-white/80' : 'text-white/40'}>{opt.odds}x</span>
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
        {selectedOdds && stakeAmount > 0 && (
          <span className="text-xs text-white/30">→ {Math.floor(stakeAmount * selectedOdds)} MP if right</span>
        )}
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
