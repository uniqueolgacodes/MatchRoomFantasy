'use client';
// Revival Roulette — actually wired up for the first time. The
// edge function (spin-revival) is the real source of truth for
// eligibility; the server-rendered reason passed in as
// initialIneligibleReason is just for a good first paint before
// anyone's tapped anything.
import { useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

interface SpinWheelProps {
  initialBalance: number;
  initialIneligibleReason: string | null;
}

export function SpinWheel({ initialBalance, initialIneligibleReason }: SpinWheelProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [ineligibleReason, setIneligibleReason] = useState(initialIneligibleReason);
  const [spinning, setSpinning] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const toast = useToast();

  async function spin() {
    setSpinning(true);
    setResult(null);

    // A brief shuffle before the real number lands — purely visual,
    // the actual outcome comes from the server call below.
    const shuffle = setInterval(() => setDisplayNumber(Math.floor(Math.random() * 6)), 80);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('spin-revival');

    clearInterval(shuffle);

    if (error || !data?.ok) {
      const reason = data?.reason ?? 'Something went wrong — try again.';
      setIneligibleReason(reason);
      setDisplayNumber(null);
      setSpinning(false);
      toast.error(reason);
      return;
    }

    setDisplayNumber(data.outcome);
    setResult(data.outcome);
    setBalance(data.newBalance);
    setSpinning(false);
    if (data.outcome > 0) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.4 }, colors: ['#16a34a', '#22c55e', '#eab308'] });
    }
  }

  const canSpin = !spinning && !ineligibleReason;

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-ink-soft px-8 py-10 text-center">
      <p className="text-sm text-white/50">Your balance</p>
      <p className="font-display text-2xl font-bold text-pitch-light">{balance} MP</p>

      <motion.div
        animate={spinning ? { rotate: [0, 360] } : {}}
        transition={spinning ? { duration: 0.6, repeat: Infinity, ease: 'linear' } : {}}
        className="mt-6 flex h-28 w-28 items-center justify-center rounded-full border-4 border-pitch/40 bg-ink text-4xl font-bold"
      >
        {displayNumber !== null ? `+${displayNumber}` : '?'}
      </motion.div>

      {result !== null && (
        <p className="mt-4 text-sm font-medium text-white/70">
          {result > 0 ? `You picked up ${result} MP.` : 'Nothing this time — try again in 15 minutes.'}
        </p>
      )}

      <button
        onClick={spin}
        disabled={!canSpin}
        className="mt-7 w-full max-w-xs rounded-lg bg-pitch px-6 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {spinning ? 'Spinning...' : 'Spin'}
      </button>

      {ineligibleReason && !spinning && (
        <p className="mt-3 text-xs text-white/40">{ineligibleReason}</p>
      )}
    </div>
  );
}
