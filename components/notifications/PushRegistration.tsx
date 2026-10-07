'use client';
// Phase A of the notification system — the piece that's been
// missing this whole time. send-push and push_subscriptions already
// existed, but nothing ever actually initialized OneSignal or saved
// a device's subscription id anywhere, so push had no devices to
// send to regardless of how well the backend was wired.
//
// Mirrors InstallPromptBanner's pattern deliberately: don't auto-
// trigger the browser's permission dialog on page load (bad opt-in
// rates, worse trust), show a dismissible card with a real value
// prop instead, and remember a "not now" for a real cooldown rather
// than asking again on the very next visit.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

const DISMISS_STORAGE_KEY = 'matchroom_push_prompt_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 14;
// Staggered later than InstallPromptBanner's own 4s delay so the two
// dismissible banners don't both show up stacked on a fresh visit —
// not a full banner-queue system, just enough spacing to avoid the
// obvious collision for now.
const SHOW_DELAY_MS = 11000;

function wasRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function PushRegistration() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user || initializedRef.current) return;
    if (typeof Notification === 'undefined') return; // unsupported browser — nothing to offer
    if (Notification.permission !== 'default' || wasRecentlyDismissed()) return;

    initializedRef.current = true;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [user]);

  async function enable() {
    if (!user) return;
    setBusy(true);
    try {
      const OneSignal = (await import('react-onesignal')).default;
      await OneSignal.init({ appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID! });
      await OneSignal.Notifications.requestPermission();

      const playerId = OneSignal.User.PushSubscription.id;
      if (playerId) {
        const supabase = createClient();
        await supabase.from('push_subscriptions').upsert(
          { user_id: user.id, provider: 'onesignal', external_id: playerId, user_agent: navigator.userAgent, last_used_at: new Date().toISOString() },
          { onConflict: 'user_id,provider,external_id' }
        );
      }
    } catch {
      // Permission denied or OneSignal unreachable — not fatal, the
      // person just doesn't get push, in-app notifications still work.
    } finally {
      setBusy(false);
      dismiss();
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-soft px-4 py-3 shadow-lg shadow-black/40 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm sm:rounded-xl sm:border">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pitch/15 text-xl">🔔</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Get notified when you win</p>
          <p className="mt-0.5 text-xs text-white/50">
            We&apos;ll only ping you for things that matter — a win, a match about to lock.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={enable}
              disabled={busy}
              className="rounded-md bg-pitch px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-50"
            >
              {busy ? 'Enabling...' : 'Turn on'}
            </button>
            <button onClick={dismiss} className="rounded-md px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}