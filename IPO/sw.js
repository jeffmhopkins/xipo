/* SpaceX IPO Tracker — service worker
 *
 * Update strategy (defeats the "stuck on old version" trap):
 *  - VERSION below is bumped on every release; changing these bytes is what
 *    triggers the browser's byte-for-byte update check.
 *  - The page registers with { updateViaCache: 'none' } and calls
 *    registration.update() on every launch, so the SW script is always
 *    revalidated against the network.
 *  - Old caches are deleted in 'activate'.
 *  - The app shell (IPO.html) is served NETWORK-FIRST so online users always
 *    get fresh UI, with a cache fallback when offline.
 *  - We do NOT skipWaiting on install; the page shows a "new version — reload"
 *    prompt and posts SKIP_WAITING when the user accepts.
 */
const VERSION = 'v1.2.0-2026.06.12';
const CACHE_NAME = `spcx-ipo-${VERSION}`;

// Files needed for the offline shell. Paths are relative to the SW scope
// (the IPO/ directory).
const PRECACHE_URLS = [
  './',
  './IPO.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Tolerate a missing './' index on static hosts: cache what we can.
      cache.addAll(PRECACHE_URLS).catch(() => cache.add('./IPO.html'))
    )
    // Intentionally no skipWaiting() — user confirms via SKIP_WAITING message.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never cache cross-origin live-data calls (proxies / Finnhub / Yahoo).
  if (url.origin !== self.location.origin) return;

  const isDocument =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // App shell -> network-first, fall back to cache offline.
  if (isDocument) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./IPO.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) ||
               (await caches.match('./IPO.html')) ||
               Response.error();
      }
    })());
    return;
  }

  // Other same-origin assets (manifest, etc.) -> cache-first.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
      return resp;
    } catch {
      return cached || Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: VERSION });
  }
});
