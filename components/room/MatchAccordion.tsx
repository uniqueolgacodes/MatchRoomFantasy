'use client';
// Fixes: pages linking several matches (a room's whole-day slate, or
// a set of upcoming virtual matches) were rendering every match's
// full PredictionsBoard expanded at once — fine for one match, a
// wall of markets for several. This collapses each match down to
// just its header (teams + kickoff) until tapped, and opening one
// closes whichever other one was open — exactly the "match info
// only, then selections, one at a time" behavior asked for.
//
// Shared balance lives one level up (the page/VirtualHub already
// owns it) and is threaded straight through to each PredictionsBoard
// via its existing controlled-balance mode, same as before — this
// component only adds the open/closed layer on top.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PredictionsBoard } from './PredictionsBoard';
import type { Market, StakeInfo } from './PredictionCard';

export interface AccordionMatch {
  matchId: string;
  header: React.ReactNode;
  markets: Market[];
}

interface MatchAccordionProps {
  matches: AccordionMatch[];
  roomId: string | null;
  stakes: Record<string, StakeInfo>;
  balance: number;
  onBalanceChange: (balance: number) => void;
}

export function MatchAccordion({ matches, roomId, stakes, balance, onBalanceChange }: MatchAccordionProps) {
  // A single match stays open by default — nothing to collapse when
  // there's only one thing to look at. Two or more start fully
  // collapsed, so the person chooses what to look at rather than
  // scrolling past everything expanded.
  const [openId, setOpenId] = useState<string | null>(matches.length === 1 ? matches[0].matchId : null);

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
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="ml-3 shrink-0 text-white/40"
              >
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
                    <PredictionsBoard
                      roomId={roomId}
                      markets={match.markets}
                      initialBalance={balance}
                      initialStakes={stakes}
                      balance={balance}
                      onBalanceChange={onBalanceChange}
                      hideBalanceHeader
                    />
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
