const CACHE_NAME = 'emastracker-shell-v3';
const CORE_ASSETS = ['./', './index.html', './produk.html', './artikel.html', './logo-emasharini.svg', './emastracker-logo.jpg', './images/articles/mula-simpan-emas.jpg', './images/articles/emas-999-916.jpg', './images/articles/jual-emas.jpg', './images/articles/tawaran-emas-online.jpg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === new URL('api/gold-price', scope).pathname) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true }))
          || (await cache.match(new URL('index.html', scope).href))
          || new Response('Emastracker perlukan sambungan internet untuk halaman ini.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
