const STATIC_CACHE = 'scoreboard-static-v1';
const RUNTIME_CACHE = 'scoreboard-runtime-v1';
const OFFLINE_URL = 'offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll([
        './',
        'index.html',
        'manifest.json',
        'service-worker.js',
        OFFLINE_URL,
        'icons/android-chrome-192x192.png',
        'icons/android-chrome-512x512.png'
      ]).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for API calls
  if (req.url.includes('/api/')) {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (e) {
        return await caches.match(OFFLINE_URL);
      }
    })());
    return;
  }

  // For navigation requests, try network then fallback to cache then offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        // attempt to cache a clone, but do not allow caching errors to break the response
        try {
          if (resp && resp.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, resp.clone());
          }
        } catch (cacheErr) {
          console.warn('SW: failed to cache navigation response', cacheErr);
        }
        return resp;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || await caches.match(OFFLINE_URL);
      }
    })());
    return;
  }

  // Cache-first for other assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(req, resp.clone());
      } catch (cacheErr) {
        console.warn('SW: failed to cache asset', cacheErr);
      }
      return resp;
    } catch (err) {
      return await caches.match(OFFLINE_URL);
    }
  })());
});
