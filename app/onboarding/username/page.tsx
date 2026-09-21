'use client';
// PRD §9.2 Onboarding — step 1. Validates and claims a username via
// the set_username RPC (supabase/migrations/0004_onboarding.sql),
// which enforces format/uniqueness/reserved-words server-side rather
// than trusting client-side checks alone.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { Loader2, Check, X } from 'lucide-react';

export default function UsernamePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill with the auto-generated username (user_xxxxxxxx from
  // handle_new_user) exactly once, so the field isn't empty but
  // still reads as a placeholder the person should replace.
  //
  // This has to run only once. The previous version guarded on
  // `!username`, which re-fires every time the field becomes empty —
  // including when the person deletes it themselves while typing —
  // so a fast backspace would "revert" the field back to the
  // placeholder mid-edit. A ref tracks whether we've already done
  // the one-time prefill, independent of the field's current value.
  const hasPrefilled = useRef(false);
  useEffect(() => {
    if (hasPrefilled.current) return;
    if (!profile?.username) return;
    hasPrefilled.current = true;
    setUsername(profile.username.replace(/^user_/, ''));
  }, [profile]);

  useEffect(() => {
    if (!username || username.length < 3) {
      setAvailable(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setChecking(true);
      const { data } = await supabase.rpc('is_username_available', { p_username: username.toLowerCase() });
      setAvailable(data ?? false);
      setChecking(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [username, supabase]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc('set_username', { p_username: username });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.push('/onboarding/age-consent');
  }

  const canSubmit = available === true && !submitting;

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Pick a username</h1>
      <p className="mt-1 text-sm text-white/60">This is how other users will see you in rooms.</p>

      <div className="mt-6">
        <div className="relative">
          <input
            className="w-full rounded-lg bg-ink-soft px-4 py-3 pr-10 outline-none focus:ring-2 focus:ring-pitch"
            placeholder="e.g. olga_predicts"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={20}
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
            {!checking && available === true && <Check className="h-4 w-4 text-pitch" />}
            {!checking && available === false && <X className="h-4 w-4 text-red-400" />}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-white/40">3-20 characters — letters, numbers, underscores only.</p>
        {available === false && !checking && (
          <p className="mt-1 text-xs text-red-400">That username isn't available.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold disabled:opacity-40"
      >
        {submitting ? 'Saving...' : 'Continue'}
      </button>
    </>
  );
}
