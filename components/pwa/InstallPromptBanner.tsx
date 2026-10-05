'use client';
// PRD §30.3 Install Prompt. Two things the browser doesn't hand you
// for free, which is why this exists instead of just relying on
// Chrome's own built-in mini-infobar:
//
// 1. "Does the app already know it's installed, so it doesn't ask
//    again" — window.matchMedia('(display-mode: standalone)') is the
//    real, standards-based way to detect this at runtime (no flag to
//    store — it's just always re-derivable from how the page is
//    currently being viewed). iOS Safari doesn't support that media
//    query for this purpose, so navigator.standalone (an iOS-only,
//    non-standard property with no TypeScript lib type) is checked
//    too.
// 2. iOS has NO beforeinstallprompt event at all — there is no
//    programmatic install API on iOS Safari, full stop. The only way
//    to "install" there is the user manually doing Share -> Add to
//    Home Screen, so iOS gets a custom instructional card instead of
//    an Install button that would do nothing.
//
// Dismissal is remembered in localStorage with a cooldown, separate
// from the standalone check above — "not now" shouldn't mean "ask
// again on the very next page load."
import { useEffect, useRef, useState } from 'react';

const DISMISS_STORAGE_KEY = 'matchroom_pwa_prompt_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 14;
const SHOW_DELAY_MS = 4000; // don't greet a fresh page load with this — let them see the app first

function isStandalone(): boolean {
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function InstallPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const deferredPromptRef = useRef<(Event & { prompt?: () => void; userChoice?: Promise<unknown> }) | null>(null);

  useEffect(() => {
    // Registered once per load regardless of whether the banner ends
    // up showing — see sw.js's own comment for why this matters even
    // though it does no caching.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIOS()) {
      const timer = setTimeout(() => {
        setIosMode(true);
        setVisible(true);
      }, SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }

    let showTimer: ReturnType<typeof setTimeout> | undefined;
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      deferredPromptRef.current = e;
      showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }
    function handleAppInstalled() {
      setVisible(false);
      // Belt-and-braces — isStandalone() will also catch this on the
      // next load, but this avoids a flash of the banner if anything
      // re-renders before then.
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent?.prompt) return;
    promptEvent.prompt();
    await promptEvent.userChoice; // accepted or dismissed, either way don't ask again this cooldown
    deferredPromptRef.current = null;
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-soft px-4 py-3 shadow-lg shadow-black/40 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm sm:rounded-xl sm:border">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pitch/15 text-xl">⚽</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Install MatchRoom</p>
          {iosMode ? (
            <p className="mt-0.5 text-xs text-white/50">
              Tap <span className="font-semibold text-white/70">Share</span>, then{' '}
              <span className="font-semibold text-white/70">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-white/50">Add it to your home screen for quick, full-screen access.</p>
          )}
          <div className="mt-2.5 flex gap-2">
            {!iosMode && (
              <button onClick={install} className="rounded-md bg-pitch px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-pitch-dark">
                Install
              </button>
            )}
            <button onClick={dismiss} className="rounded-md px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white/80">
              {iosMode ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
