'use client';
// PRD §9.2 Onboarding — new step between username and buddy.
// PRD §34.5 Regulatory Notes flags an age gate as required before
// any use beyond friends-and-family testing (18+, since the
// redemption catalog's sponsored_prize category can carry monetary
// value). This step self-certifies that and records a timestamp —
// see supabase/migrations/0006_age_gate.sql for why we store a
// consent timestamp rather than a date of birth.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { Check } from 'lucide-react';

export default function AgeConsentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!user || !confirmed) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ age_confirmed_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      setError('Something went wrong — please try again.');
      setSubmitting(false);
      return;
    }
    router.push('/onboarding/buddy');
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Quick check</h1>
      <p className="mt-1 text-sm text-white/60">
        MatchRoom has no cash entry and no cash prizes — Match Points can't be bought, sold, or
        cashed out. This is just to keep us on the right side of the rules.
      </p>

      <button
        type="button"
        onClick={() => setConfirmed((v) => !v)}
        className="mt-6 flex w-full items-start gap-3 rounded-lg bg-ink-soft px-4 py-4 text-left"
      >
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            confirmed ? 'border-pitch bg-pitch' : 'border-white/30 bg-transparent'
          }`}
        >
          {confirmed && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </span>
        <span className="text-sm text-white/80">
          I confirm I'm <strong className="text-white">18 or older</strong> and agree to
          MatchRoom's Terms of Service and Privacy Policy.
        </span>
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={!confirmed || submitting}
        className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold disabled:opacity-40"
      >
        {submitting ? 'Saving...' : 'Continue'}
      </button>
    </>
  );
}
