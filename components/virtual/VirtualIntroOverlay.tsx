'use client';
// First-time hype/explainer for /virtual. Shown once (gated by
// profiles.virtual_intro_seen_at, checked server-side in
// app/(main)/virtual/page.tsx), then never again. Marking it seen
// goes through a direct client update rather than an RPC — this is
// exactly the class of harmless self-service preference flag the
// existing column-grant convention already covers (same shape as
// buddy_enabled), so it doesn't need new server code.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

interface Card {
  emoji: string;
  title: string;
  body: string;
}

const CARDS: Card[] = [
  {
    emoji: '⚡',
    title: 'Welcome to Virtual Matches',
    body: 'Fictional clubs, real Match Points, a brand new match every single hour — day or night.',
  },
  {
    emoji: '🕐',
    title: 'Matches drop 3 hours ahead',
    body: "Browse the upcoming set, pick your markets, and lock in your predictions whenever suits you — no rushing.",
  },
  {
    emoji: '🏆',
    title: 'It settles itself',
    body: "Once you've predicted, you're done. The match plays out, results land, MP hits your balance — even if you're nowhere near your phone.",
  },
  {
    emoji: '👀',
    title: 'Ready?',
    body: 'Your first set is right below. Go on.',
  },
];

interface VirtualIntroOverlayProps {
  userId: string;
  initialShow: boolean;
}

export function VirtualIntroOverlay({ userId, initialShow }: VirtualIntroOverlayProps) {
  const [show, setShow] = useState(initialShow);
  const [step, setStep] = useState(0);
  const isLast = step === CARDS.length - 1;

  async function markSeen() {
    setShow(false);
    const supabase = createClient();
    await supabase.from('profiles').update({ virtual_intro_seen_at: new Date().toISOString() }).eq('id', userId);
  }

  if (!show) return null;

  const card = CARDS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-soft p-6"
      >
        <div className="mb-5 flex items-center gap-1.5">
          {CARDS.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-pitch' : 'bg-white/10'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="text-4xl">{card.emoji}</div>
            <h2 className="mt-3 font-display text-xl font-bold">{card.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{card.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={markSeen} className="text-sm text-white/40 transition-colors hover:text-white/70">
            Skip
          </button>
          <button
            onClick={() => (isLast ? markSeen() : setStep((s) => s + 1))}
            className="rounded-lg bg-pitch px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-pitch-dark"
          >
            {isLast ? "Let's go" : 'Next'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
