// public/sw.js
const CACHE_NAME = 'matchroom-assets-v1';

// Assets we want to cache immediately on install
const PRECACHE_ASSETS = [
  '/sounds/pop.mp3',
  '/sounds/goal.mp3',
  '/sounds/whistle.mp3',
  '/sounds/win.mp3',
  '/icons/192.png',
  '/icons/512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets');
      return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Cache-First Strategy for Sounds and Icons
  if (url.pathname.startsWith('/sounds/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse; // Instant load from disk

        return fetch(event.request).then((response) => {
          // Cache it for next time
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Next.js handles the rest of the routing/caching natively.
});