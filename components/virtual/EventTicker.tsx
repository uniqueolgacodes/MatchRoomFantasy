'use client';
// Animated feed of match_events as they arrive. Emoji rather than an
// icon library here deliberately — "GOAL" reads instantly as ⚽ in a
// way a generic icon glyph wouldn't, and it costs nothing extra
// (framer-motion is already a dependency; no new one added for this).
import { AnimatePresence, motion } from 'framer-motion';

export interface TickerEvent {
  id: string;
  type: string;
  minute: number;
  teamShortName: string;
}

const EVENT_DISPLAY: Record<string, { emoji: string; label: string }> = {
  goal: { emoji: '⚽', label: 'GOAL!' },
  near_miss: { emoji: '😬', label: 'So close' },
  big_save: { emoji: '🧤', label: 'Big save' },
  corner: { emoji: '🚩', label: 'Corner' },
  yellow_card: { emoji: '🟨', label: 'Yellow card' },
  red_card: { emoji: '🟥', label: 'RED CARD' },
  var_check: { emoji: '📺', label: 'VAR check' },
};

export function EventTicker({ events }: { events: TickerEvent[] }) {
  if (events.length === 0) {
    return <p className="py-3 text-center text-xs text-white/30">Kickoff imminent...</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {events.map((event) => {
          const display = EVENT_DISPLAY[event.type] ?? { emoji: '•', label: event.type };
          const isBigMoment = event.type === 'goal' || event.type === 'red_card';
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                isBigMoment ? 'bg-pitch/10 font-semibold text-pitch-light' : 'bg-white/[0.03] text-white/70'
              }`}
            >
              <span className="text-base leading-none">{display.emoji}</span>
              <span className="w-8 shrink-0 tabular-nums text-white/40">{event.minute}'</span>
              <span className="flex-1">{display.label}</span>
              <span className="shrink-0 text-xs text-white/40">{event.teamShortName}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
