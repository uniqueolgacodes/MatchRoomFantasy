'use client';
// Shared shell for onboarding. Step order: welcome -> username ->
// age-consent -> buddy -> teams -> guide. This extends the original
// three-step flow (PRD §9.2) with a welcome splash up front, an
// age/ToS gate (PRD §34.5 — required before any use beyond
// friends-and-family testing), and a closing feature guide, all
// wrapped around the original username/buddy/team steps.
import { usePathname } from 'next/navigation';

const STEPS = [
  { path: '/onboarding/welcome', label: 'Welcome' },
  { path: '/onboarding/username', label: 'Username' },
  { path: '/onboarding/age-consent', label: 'Age' },
  { path: '/onboarding/buddy', label: 'Buddy' },
  { path: '/onboarding/teams', label: 'Team' },
  { path: '/onboarding/guide', label: 'Guide' },
];

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentIndex = STEPS.findIndex((s) => pathname.startsWith(s.path));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div
            key={step.path}
            aria-hidden
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              i <= currentIndex ? 'bg-pitch' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      {/* Re-keying on pathname retriggers the CSS entrance animation
          each step renders with, so the flow feels like it's moving
          forward rather than just swapping content in place. */}
      <div key={pathname} className="animate-fade-scale-in">
        {children}
      </div>
    </main>
  );
}
