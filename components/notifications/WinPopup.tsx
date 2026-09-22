'use client';
// Mounted once in (main)/layout.tsx — listens on win_notifications
// for the current user (via postgres_changes, RLS-scoped to their
// own rows) and shows a celebratory popup for every win, real or
// virtual, since both settle through the same settle_predictions_
// batch function. This is the first real use of canvas-confetti,
// which has sat unused in package.json since the original scaffold.
//
// Shows the amount WON (+10 MP), not the resulting balance — the
// balance already updates wherever it's displayed; this is
// specifically "you just won this."
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

const CONGRATS_MESSAGES = [
  "Oya, that's how it's done!",
  'Called it like a pro.',
  'Big brain energy.',
  'You called it!',
  'Certified predictor.',
  "That's the one!",
  'Nice eye.',
  "You're on one today.",
];

const DISPLAY_DURATION_MS = 6000;

interface WinEvent {
  id: string;
  mpAmount: number;
  message: string;
}

export function WinPopup() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<WinEvent[]>([]);
  const [current, setCurrent] = useState<WinEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`win-notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'win_notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; mp_amount: number };
          const message = CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)];
          setQueue((prev) => [...prev, { id: row.id, mpAmount: row.mp_amount, message }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Advance the queue one at a time — settling several markets at
  // once shouldn't stack multiple popups on top of each other.
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      fireConfetti();
      timeoutRef.current = setTimeout(() => setCurrent(null), DISPLAY_DURATION_MS);
    }
  }, [current, queue]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function dismiss() {
    clearTimeout(timeoutRef.current);
    setCurrent(null);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-pitch/30 bg-ink-soft px-5 py-4 shadow-2xl shadow-black/50"
          >
            <motion.span
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
              className="text-3xl"
            >
              🏆
            </motion.span>
            <div>
              <p className="text-sm font-semibold text-white/80">{current.message}</p>
              <p className="font-display text-lg font-bold text-pitch-light">+{current.mpAmount} MP</p>
            </div>
            <button onClick={dismiss} className="ml-2 shrink-0 text-white/30 transition-colors hover:text-white/60">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.15 },
    colors: ['#16a34a', '#22c55e', '#eab308', '#f2f0e8'],
  });
}
