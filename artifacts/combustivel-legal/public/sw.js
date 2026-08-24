const VERSION = 'combustivel-legal-v2';
const APP_CACHE = `${VERSION}-app`;
const MAP_CACHE = `${VERSION}-map`;
const API_CACHE = `${VERSION}-api`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('combustivel-legal-') && ![APP_CACHE, MAP_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isMapTile(url) {
  return url.hostname.includes('tile.openstreetmap.org');
}

function isPublicApiGet(request, url) {
  if (request.method !== 'GET' || request.headers.has('authorization')) return false;

  // Cache only resources whose payload is public and independent of the
  // anonymous session. Every other API request must always reach the network:
  // Cache Storage does not distinguish responses by Authorization headers.
  return url.pathname === '/api/postos' || url.pathname === '/api/geo/buscar';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isMapTile(url)) {
    event.respondWith(
      caches.open(MAP_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  if (isPublicApiGet(request, url)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Never let private or mutation-adjacent API responses fall through to the
  // generic app-shell cache below.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method === 'GET' && request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match('./index.html')),
    );
    return;
  }

  if (request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});