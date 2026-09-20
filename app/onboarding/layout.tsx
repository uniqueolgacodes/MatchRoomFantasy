'use client';
// Shared shell for the three onboarding steps — a simple progress
// indicator so the flow doesn't feel open-ended. Step order matches
// PRD §9.2: username -> buddy opt-in -> favourite team.
import { usePathname } from 'next/navigation';

const STEPS = [
  { path: '/onboarding/username', label: 'Username' },
  { path: '/onboarding/buddy', label: 'Buddy' },
  { path: '/onboarding/teams', label: 'Team' },
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
            className={`h-1 flex-1 rounded-full ${i <= currentIndex ? 'bg-pitch' : 'bg-white/10'}`}
          />
        ))}
      </div>
      {children}
    </main>
  );
}
