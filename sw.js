const CACHE_NAME = 'gamestation-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/supabase-config.js',
  '/js/store.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/history.js',
  '/js/members.js',
  '/js/settings.js',
  '/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network-first for API calls, cache-first for static assets
  if (e.request.url.includes('supabase.co')) {
    return; // Let Supabase requests go through normally
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
