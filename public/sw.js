/* Phase 1: cache only the static application shell, never /api calls. */
const CACHE = 'gramsaathi-shell-__CACHE_VERSION__';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const manifest = await fetch('/precache-assets.json', { cache: 'no-store' });
    if (!manifest.ok) throw new Error('Could not load shell manifest');
    const assets = await manifest.json();
    const cache = await caches.open(CACHE);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('gramsaathi-shell-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/')) || Response.error();
      return Response.error();
    }
  })());
});
