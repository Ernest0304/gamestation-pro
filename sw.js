// SELF-DESTRUCT: this service worker exists only to unregister itself.
// Cause: repeated stale-cache issues on iPad / Safari prevented users from
// seeing new deploys. Until we revisit a proper offline strategy, all caching
// is delegated to Vercel's HTTP cache-control headers (already configured).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Delete every cache we ever created
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // Unregister this very SW
    await self.registration.unregister();
    // Force-reload all controlled pages so they pick up fresh assets without SW
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
  })());
});

// While alive, do not intercept anything — let network handle all requests.
self.addEventListener('fetch', () => {});
