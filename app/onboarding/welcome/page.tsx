'use client';
// PRD §9.2 Onboarding — step 0 (new). A short, animated welcome
// before any form fields, so signup doesn't dump a stranger straight
// into a username prompt. Introduces the four pillars from PRD §1.1
// (Room / League / Hub / Points) as a quick, staggered reveal.
//
// Deliberately no data fetching or writes here — this step is pure
// intro, so it costs nothing to render and nothing to skip.
//
// No name-based personalization: at this point in the flow the
// person hasn't set a username yet, so profile.display_name is still
// handle_new_user()'s signup placeholder ("New Fan") — greeting
// "Welcome, New!" off that would be worse than a generic greeting,
// not better. Real personalization can happen post-onboarding once
// a username exists.
import { useRouter } from 'next/navigation';

const PILLARS = [
  { emoji: '💬', title: 'The Room', body: 'Live matchday chat and predictions with your squad.' },
  { emoji: '🏆', title: 'The League', body: 'Season-long fantasy scoring across every gameweek.' },
  { emoji: '📰', title: 'The Hub', body: 'News and fixtures for the teams you follow.' },
  { emoji: '⚡', title: 'Match Points', body: 'No cash, ever — just bragging rights and trophies.' },
];

export default function WelcomePage() {
  const router = useRouter();

  return (
    <>
      <div className="text-center">
        <div className="animate-fade-scale-in mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-pitch/15 text-3xl">
          ⚽
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold">Welcome to MatchRoom</h1>
        <p className="mt-1 text-sm text-white/60">
          Free EPL prediction rooms — no cash, just banter and bragging rights. Here's what you're
          walking into.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {PILLARS.map((pillar, i) => (
          <div
            key={pillar.title}
            className="animate-fade-scale-in flex items-start gap-3 rounded-lg bg-ink-soft px-4 py-3"
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            <span className="text-xl leading-none">{pillar.emoji}</span>
            <div>
              <p className="text-sm font-semibold">{pillar.title}</p>
              <p className="text-xs text-white/50">{pillar.body}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push('/onboarding/username')}
        className="mt-8 w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark"
      >
        Let's get set up
      </button>
      <p className="mt-3 text-center text-xs text-white/30">Takes about a minute.</p>
    </>
  );
}
