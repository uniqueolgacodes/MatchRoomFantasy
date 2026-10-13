'use client';
// The automated prompt for Push Notifications.
// Converts the old, easy-to-miss banner into a clear, animated modal popup.
// Respects the user's current browser settings: if they already allowed or
// denied push notifications, this stays completely hidden so they aren't disturbed.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { enablePush } from '@/lib/notifications/push';

const DISMISS_STORAGE_KEY = 'matchroom_push_prompt_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 14;
const SHOW_DELAY_MS = 3500; // Triggers after 3.5 seconds so they actually see it

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

    // 1. Check if the browser supports push at all (e.g., standard iOS Safari without PWA doesn't)
    if (typeof Notification === 'undefined') return;

    // 2. THIS IS THE CRITICAL CHECK:
    // If permission is 'granted' or 'denied', we do NOT show the popup.
    // 'default' means the browser hasn't asked them yet.
    if (Notification.permission !== 'default') return;

    // 3. Check if they clicked "Ask me later" recently
    if (wasRecentlyDismissed()) return;

    initializedRef.current = true;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [user]);

  async function enable() {
    if (!user) return;
    setBusy(true);
    // Fires the OneSignal prompt. Browsers require this to happen 
    // directly after a user gesture (like this button click).
    await enablePush(user.id);
    setBusy(false);
    dismiss(true); // Treat as permanently handled, they either accepted or blocked
  }

  function dismiss(permanent = false) {
    if (permanent) {
      // If they interacted with the prompt natively, never show this custom UI again
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() + 1000 * 24 * 60 * 60 * 1000));
    } else {
      // "Ask me again later" -> Hides for 14 days
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    }
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-0"
        >
          <motion.div
            initial={{ scale: 0.95, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 40 }}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-ink-soft p-6 shadow-2xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pitch/20 text-2xl">
              🔔
            </div>
            <h2 className="mt-4 font-display text-xl font-bold">Never miss a win</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Turn on notifications so we can tell you the exact moment your predictions win Match Points, and when kickoff is approaching!
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={enable}
                disabled={busy}
                className="w-full rounded-xl bg-pitch px-4 py-3.5 font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-50"
              >
                {busy ? 'Enabling...' : 'Turn on notifications'}
              </button>
              <button
                onClick={() => dismiss(false)}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                Ask me again later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}