'use client';
// Mounted once in (main)/layout.tsx — shows a celebratory popup for
// every win, real or virtual, since both settle through the same
// settle_predictions_batch function.
//
// Reads from the generalized `notifications` table (type='win') as
// of Phase A of the notification system.

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { useSound } from '@/providers/SoundProvider'; // <-- IMPORT ADDED HERE

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

interface WinEvent {
  id: string;
  mpAmount: number;
  message: string;
}

function randomMessage() {
  return CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)];
}

export function WinPopup() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<WinEvent[]>([]);
  const [current, setCurrent] = useState<WinEvent | null>(null);
  const hasFiredConfettiRef = useRef<string | null>(null);
  const { playWin } = useSound(); // <-- Hook initialized here

  // Catch-up: anything that settled while this person wasn't connected.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('notifications')
      .select('id, metadata')
      .eq('user_id', user.id)
      .eq('type', 'win')
      .is('read_at', null)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setQueue((prev) => [
          ...data.map((row) => ({ id: row.id, mpAmount: row.metadata?.mp_amount ?? 0, message: randomMessage() })),
          ...prev,
        ]);
      });
  }, [user]);

  // Live: anything that settles while connected, shown immediately.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; type: string; metadata: { mp_amount?: number } };
          if (row.type !== 'win') return;
          setQueue((prev) => [...prev, { id: row.id, mpAmount: row.metadata?.mp_amount ?? 0, message: randomMessage() }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Advance the queue one at a time...
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      if (hasFiredConfettiRef.current !== next.id) {
        hasFiredConfettiRef.current = next.id;
        fireConfetti();
        playWin(); // <-- Play sound when confetti fires
      }
      // Mark read the moment it's actually shown
      const supabase = createClient();
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', next.id).then();
    }
  }, [current, queue, playWin]);

  function dismiss() {
    setCurrent(null);
  }

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl border border-pitch/30 bg-ink-soft px-8 py-10 text-center shadow-2xl shadow-black/60"
          >
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <motion.span
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
              className="inline-block text-7xl"
            >
              🏆
            </motion.span>

            <p className="mt-5 text-lg font-semibold text-white/80">{current.message}</p>
            <p className="font-display mt-1 text-4xl font-bold text-pitch-light">+{current.mpAmount} MP</p>

            <button
              onClick={dismiss}
              className="mt-7 w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark"
            >
              Nice!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function fireConfetti() {
  confetti({
    particleCount: 120,
    spread: 90,
    origin: { y: 0.4 },
    colors: ['#16a34a', '#22c55e', '#eab308', '#f2f0e8'],
  });
}