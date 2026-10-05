// Minimal service worker. This intentionally does NOT implement the
// caching strategy from PRD §30.2 (app shell / data / images caches,
// network-first vs cache-first per route) — that's separate, larger
// scope. What's here exists for one narrow reason: most browsers
// only fire `beforeinstallprompt` (the event InstallPromptBanner
// listens for) once a page has a registered service worker with a
// fetch handler — no caching behavior required, just presence. This
// is that minimum, nothing more.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Deliberately a no-op — every request just falls through to the
  // network exactly as if there were no service worker at all. Real
  // caching strategy is future work, not a silent side effect of the
  // PWA install prompt.
});
