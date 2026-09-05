const CACHE = 'slip-v3';
const SHELL = ['./', './index.html', './manifest.json',
               './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // drop every older cache
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // force any open window to re-navigate, so a stale page can't linger
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname === 'api.github.com' || url.hostname === 'open.er-api.com') return;
  if (e.request.method !== 'GET') return;

  const isDoc = e.request.mode === 'navigate' ||
                (e.request.destination === 'document') ||
                url.pathname.endsWith('/') ||
                url.pathname.endsWith('index.html');

  e.respondWith((async () => {
    try {
      // bypass the HTTP cache for the app itself — this is what kept old builds alive
      const res = await fetch(e.request, isDoc ? { cache: 'reload' } : {});
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    } catch (_) {
      const hit = await caches.match(e.request);
      return hit || caches.match('./index.html');
    }
  })());
});
