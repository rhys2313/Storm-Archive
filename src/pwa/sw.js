/* Generated from the complete production build. Never cache user data or tiles. */
const VERSION = __STORM_VERSION__;
const RESOURCES = __STORM_RESOURCES__;
const PREFIX = 'storm-archive-app-';
const CACHE = PREFIX + VERSION;
const paths = new Set(RESOURCES.map(resource => resource.url));
const owned = name => name.startsWith(PREFIX) || /^storm-archive-cache-v\d+$/.test(name);

async function verifiedResponse(resource) {
  const response = await fetch(resource.url, { cache: 'reload' });
  if (!response.ok || response.redirected) throw new Error(`PWA resource unavailable: ${resource.url}`);
  const bytes = await response.clone().arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== resource.revision) throw new Error(`PWA resource changed during installation: ${resource.url}`);
  return response;
}

async function prepareCache() {
  // Fetch and verify the whole release before committing anything. A failed
  // install must not activate a partly downloaded or mixed deployment.
  const responses = [];
  for (const resource of RESOURCES) {
    responses.push(await verifiedResponse(resource));
  }
  const cache = await caches.open(CACHE);
  for (let index = 0; index < RESOURCES.length; index++) {
    await cache.put(RESOURCES[index].url, responses[index]);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { await prepareCache(); }
    catch (error) { await caches.delete(CACHE); throw error; }
    // First install activates normally. Updates wait for closed clients or an
    // explicit, coordinated request; do not interrupt an observation form.
  })());
});

function clientState(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = state => { clearTimeout(timer); channel.port1.close(); resolve(state); };
    const timer = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = event => finish(event.data);
    try { client.postMessage({ type: 'STORM_CLIENT_STATE' }, [channel.port2]); }
    catch { finish(null); }
  });
}

let cleaning;
function cleanOldCaches() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const states = await Promise.all(clients.map(clientState));
    // Legacy/unresponsive pages may still need an old lazy chunk.
    if (states.some(state => !state?.entry)) return;
    const names = (await caches.keys()).filter(owned);
    const older = names.filter(name => name !== CACHE);
    const previous = older[older.length - 1];
    for (const name of names) {
      // One previous release covers in-flight navigations during activation.
      if (name === CACHE || name === previous) continue;
      const cache = await caches.open(name);
      const inUse = await Promise.all(states.map(state => cache.match(state.entry)));
      if (!inUse.some(Boolean)) await caches.delete(name);
    }
  })().finally(() => { cleaning = null; });
  return cleaning;
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => { await self.clients.claim(); await cleanOldCaches(); })());
});

self.addEventListener('message', event => {
  const reply = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'STORM_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const keys = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
      reply({ version: VERSION, ready: RESOURCES.every(resource => keys.has(resource.url)) });
    })());
  } else if (event.data?.type === 'STORM_ACTIVATE') {
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const states = await Promise.all(clients.map(clientState));
      if (states.some(state => !state?.canUpdate)) { reply({ ok: false }); return; }
      reply({ ok: true });
      await self.skipWaiting();
    })());
  } else if (event.data?.type === 'STORM_CLIENT_READY') {
    event.waitUntil(cleanOldCaches());
  } else if (event.data?.type === 'STORM_REPAIR') {
    event.waitUntil(prepareCache().then(() => reply({ ok: true }), () => reply({ ok: false })));
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // HTML always belongs to the controlling worker's release, even online.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('/index.html')) || (await recoverResource('/index.html', cache)) || Response.error();
    })());
  } else if (paths.has(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const current = await caches.open(CACHE);
      const cached = await current.match(url.pathname);
      if (cached) return cached;
      // A page kept open during activation may request its previous lazy chunk.
      for (const name of (await caches.keys()).filter(owned).reverse()) {
        const previous = await (await caches.open(name)).match(url.pathname);
        if (previous) return previous;
      }
      const recovered = await recoverResource(url.pathname, current);
      if (recovered) return recovered;
      // Never replace a missing script with HTML, or grow a runtime cache with
      // arbitrary requests/query strings. A repair needs the exact build bytes.
      return new Response('', { status: 504, statusText: 'App resource unavailable' });
    })());
  }
});

async function recoverResource(path, cache) {
  const resource = RESOURCES.find(resource => resource.url === path);
  if (!resource) return null;
  // Recover an evicted entry online only if the server still has these exact
  // release bytes. Storage pressure must not discard a healthy network response.
  try {
    const response = await verifiedResponse(resource);
    try { await cache.put(path, response.clone()); } catch { /* usable online */ }
    return response;
  } catch { return null; }
}
