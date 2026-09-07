// SecurePath Service Worker — v3
// Network-first navigation + stale-while-revalidate static assets.
// Cache versioning guarantees that a new deployment can evict stale app shells.

const CACHE_NAME = 'securepath-v3';
const SHELL = [
  './wathiqati-app.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('[SecurePath SW] install failed:', error);
        // Do not block service-worker activation on a single optional asset.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            );
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => {
          if (cached) return cached;
          return caches.match('./wathiqati-app.html');
        }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          );
        }
        return response;
      });
      return cachedResponse || network;
    }).catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' }))
  );
});
