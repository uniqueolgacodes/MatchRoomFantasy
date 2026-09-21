'use client';
// PRD §9.2 Onboarding — final step (new). A short, swipeable-by-tap
// guide covering the mechanics a first-time user actually needs
// (how rooms work, how Match Points work, where Buddy fits) before
// dropping them into the home feed. This is also where
// onboarding_completed_at finally gets set — moved here from the
// teams step so the guide isn't skippable by a redirect racing
// ahead of it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '🔗',
    title: 'Rooms live on WhatsApp',
    body: "Every room has a share link and a 6-character code. Send it to your group chat and they're in.",
  },
  {
    emoji: '🎯',
    title: "Predict, don't bet",
    body: 'Stake Match Points on match outcomes — winner, correct score, cards, corners. Get it right, earn MP. It never costs real money.',
  },
  {
    emoji: '⏱️',
    title: 'Two windows per match',
    body: 'Pre-match markets lock at kickoff. A fresh set of half-time markets opens at HT and locks 15 minutes later.',
  },
  {
    emoji: '🏅',
    title: 'Climb the table',
    body: "Win your room, win the season, or top the World Rankings. Every win earns a trophy you can show off.",
  },
];

export default function OnboardingGuidePage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const supabase = createClient();

  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  async function finish() {
    if (!user) return;
    setFinishing(true);
    await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);
    await refreshProfile();
    router.push('/');
  }

  return (
    <>
      {isLast ? <FinishHeader /> : null}

      <div key={index} className="animate-fade-scale-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-pitch/15 text-3xl">
          {slide.emoji}
        </div>
        <h1 className="font-display mt-4 text-xl font-bold">{slide.title}</h1>
        <p className="mt-2 text-sm text-white/60">{slide.body}</p>
      </div>

      <div className="mt-8 flex justify-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-pitch' : 'w-1.5 bg-white/15'
            }`}
          />
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {index > 0 && (
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-lg px-4 py-3 text-sm font-medium text-white/50 hover:text-white/80"
          >
            Back
          </button>
        )}
        {!isLast ? (
          <button
            onClick={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
            className="flex-1 rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark"
          >
            Next
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={finishing}
            className="flex-1 rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-40"
          >
            {finishing ? 'Taking you in...' : "Let's go!"}
          </button>
        )}
      </div>
    </>
  );
}

// A small burst of CSS-only confetti dots shown above the final
// slide, celebrating "onboarding complete" without pulling in
// canvas-confetti for a one-off moment this small.
function FinishHeader() {
  const dots = ['#16a34a', '#eab308', '#22c55e', '#f2f0e8', '#16a34a', '#eab308'];
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto -mt-4 mb-2 h-6 w-full max-w-[200px]">
      {dots.map((color, i) => (
        <span
          key={i}
          className="animate-confetti-fall absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${(i / (dots.length - 1)) * 100}%`,
            backgroundColor: color,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}
