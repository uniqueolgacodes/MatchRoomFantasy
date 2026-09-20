'use client';
// PRD §9.2 Onboarding — step 2. Buddy AI opt-in (PRD §19). The toggle
// only sets a preference — this step never blocks progress either
// way, since it's not required for the app to function.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

export default function BuddyOnboardingPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();
  const [enabled, setEnabled] = useState(profile?.buddy_enabled ?? true);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    if (!user) return;
    setSubmitting(true);
    await supabase.from('profiles').update({ buddy_enabled: enabled }).eq('id', user.id);
    router.push('/onboarding/teams');
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Meet Buddy</h1>
      <p className="mt-1 text-sm text-white/60">
        Buddy reacts to goals, cards, and match moments — a little personality while you follow along.
        You can turn this off any time in Settings.
      </p>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-ink-soft px-4 py-4">
        <span className="font-medium">Enable Buddy</span>
        <button
          onClick={() => setEnabled((v) => !v)}
          className={`h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-pitch' : 'bg-white/20'}`}
        >
          <span
            className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <button
        onClick={handleContinue}
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold disabled:opacity-40"
      >
        {submitting ? 'Saving...' : 'Continue'}
      </button>
    </>
  );
}
