// Revival Roulette. PRD §11-12 — was a placeholder stub; now wired to
// the (fixed) spin-revival edge function. Replicates the same
// eligibility checks server-side purely for a good first paint —
// spin-revival itself remains the authoritative enforcer.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentBalance } from '@/lib/points/balance';
import { SpinWheel } from '@/components/revival/SpinWheel';

const REVIVAL_THRESHOLD = 1;
const MIN_ACCOUNT_AGE_DAYS = 7;

export default async function RevivalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  const [balance, { count: runningCount }, { data: profile }] = await Promise.all([
    getCurrentBalance(supabase, user.id),
    supabase.from('prediction_stakes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('is_correct', null),
    supabase.from('profiles').select('created_at').eq('id', user.id).single(),
  ]);

  let ineligibleReason: string | null = null;
  if (balance >= REVIVAL_THRESHOLD) {
    ineligibleReason = `Revival unlocks once your balance drops below ${REVIVAL_THRESHOLD} MP.`;
  } else if ((runningCount ?? 0) > 0) {
    ineligibleReason = 'You have a prediction still running — check back once it settles.';
  } else if (profile) {
    const ageDays = (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000;
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      ineligibleReason = 'Revival unlocks once your account is a week old.';
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white">
        ← Back
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold">Revival Roulette</h1>
      <p className="mt-1 text-sm text-white/50">
        Down to nothing? One free spin for a top-up, once you've got no predictions left running.
      </p>

      <div className="mt-6">
        <SpinWheel initialBalance={balance} initialIneligibleReason={ineligibleReason} />
      </div>
    </main>
  );
}
