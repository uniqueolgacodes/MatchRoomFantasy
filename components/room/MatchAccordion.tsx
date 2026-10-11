'use client';
// Pages linking several matches (a room's whole-day slate, or a set of
// upcoming virtual matches) collapse each match down to its header
// until tapped; opening one closes the other.
//
// Added: `panel` — when a match has no open markets (live, finished,
// awaiting result) the page passes a MatchPhasePanel here and it is
// rendered instead of an empty PredictionsBoard. `defaultOpenId` — a
// multi-match room opens on the match that matters (live or next up)
// instead of starting fully collapsed. Both are optional, so the
// virtual hub's existing usage is unchanged.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PredictionsBoard } from './PredictionsBoard';
import type { Market, StakeInfo } from './PredictionCard';

export interface AccordionMatch {
  matchId: string;
  header: React.ReactNode;
  markets: Market[];
  panel?: React.ReactNode;
}

interface MatchAccordionProps {
  matches: AccordionMatch[];
  roomId: string | null;
  stakes: Record<string, StakeInfo>;
  balance: number;
  onBalanceChange: (balance: number) => void;
  defaultOpenId?: string | null;
}

export function MatchAccordion({ matches, roomId, stakes, balance, onBalanceChange, defaultOpenId }: MatchAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? (matches.length === 1 ? matches[0].matchId : null));

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => {
        const isOpen = openId === match.matchId;
        return (
          <div key={match.matchId} className="overflow-hidden rounded-xl border border-white/10 bg-ink-soft">
            <button
              onClick={() => setOpenId(isOpen ? null : match.matchId)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="min-w-0 flex-1 text-sm">{match.header}</div>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="ml-3 shrink-0 text-white/40">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/10 px-4 py-4">
                    {match.panel ?? (
                      <PredictionsBoard
                        roomId={roomId}
                        markets={match.markets}
                        initialBalance={balance}
                        initialStakes={stakes}
                        balance={balance}
                        onBalanceChange={onBalanceChange}
                        hideBalanceHeader
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}