/* Storm Archive service worker.
 *
 * Strategy:
 *   navigation  - network first, so an installed app picks up a new build as
 *                 soon as it is online, with the cached shell as offline fallback
 *   static      - cache first, which is safe because Vite emits hashed filenames
 *   everything  - cross-origin requests (map tiles) are never cached
 */

const CACHE_NAME = 'storm-archive-cache-v4';
const APP_SHELL = '/index.html';
const PRECACHE = ['/', APP_SHELL, '/manifest.json', '/pwa-192.png', '/pwa-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Added individually: addAll rejects the whole install if a single entry
      // fails, which would leave the app without any offline support at all.
      await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

/**
 * True when the server answered an asset request with the SPA shell.
 *
 * This happens when a stale cached page asks for a hashed file that no longer
 * exists after a new build: the server's history fallback returns index.html.
 * Such a response must never be cached, or the wrong content type would be
 * pinned under a script URL and the app would fail to start until the cache is
 * cleared by hand.
 */
const isShellFallback = (request, response) => {
  const destination = request.destination;
  if (destination !== 'script' && destination !== 'style' && destination !== 'worker') return false;
  return (response.headers.get('content-type') || '').includes('text/html');
};

const putInCache = async (request, response) => {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // Storage pressure must never break the response being returned.
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only same-origin app assets are managed here. Map tiles and any other
  // third-party resource go straight to the network.
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || accept.includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a healthy page becomes the offline shell; caching an error page
          // would leave the app unopenable offline.
          if (response.ok) putInCache(APP_SHELL, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(APP_SHELL)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (isShellFallback(request, response)) {
            // Surfaced as a failure so the import rejects and the error boundary
            // can offer a reload, instead of the browser choking on HTML.
            return new Response('', { status: 504, statusText: 'Stale asset reference' });
          }
          if (response && response.status === 200 && response.type === 'basic') {
            putInCache(request, response.clone());
          }
          return response;
        })
        // Returning the HTML shell for a missing script or image would produce
        // a confusing MIME-type error, so a plain failure is reported instead.
        .catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
