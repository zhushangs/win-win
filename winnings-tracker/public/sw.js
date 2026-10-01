/* Win Win service worker: makes the app load offline after the first visit.
 *
 * - On install, caches index.html plus the hashed JS/CSS bundles listed in asset-manifest.json.
 * - Page loads are network-first, so a new deploy shows up as soon as you're online;
 *   when offline, the cached index.html is served.
 * - Other same-origin files are served from cache when available (bundle names are hashed,
 *   so a cached copy is never stale).
 * Your data is not cached here; it lives in IndexedDB.
 */
const CACHE = 'win-win-v1';
const scopeUrl = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = [scopeUrl('./'), scopeUrl('index.html'), scopeUrl('manifest.json')];
    try {
      const res = await fetch(scopeUrl('asset-manifest.json'), { cache: 'no-store' });
      const manifest = await res.json();
      (manifest.entrypoints || []).forEach((p) => urls.push(scopeUrl(p)));
    } catch (e) {
      // Still installable; bundles get cached the first time they're fetched.
    }
    await cache.addAll(urls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(scopeUrl('index.html'), res.clone());
        return res;
      } catch {
        return (await cache.match(scopeUrl('index.html'))) || (await cache.match(scopeUrl('./'))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
