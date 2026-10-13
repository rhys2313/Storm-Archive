// @vitest-environment node
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { generateServiceWorker } from '../../build/pwa.js';

const templatePath = resolve('src/pwa/sw.js');
const template = await readFile(templatePath, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const origin = 'https://storm.test';
class Channel {
  constructor() {
    this.port1 = { close() {}, onmessage: null };
    this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
  }
}
function worker({ files = { '/index.html': 'release A', '/assets/main-A.js': 'main', '/assets/map-A.css': 'map' }, states = [] } = {}) {
  const handlers = {};
  const stores = new Map();
  const put = vi.fn(async (name, key, response) => stores.get(name).set(new URL(key, origin).href, response.clone()));
  const caches = {
    keys: async () => [...stores.keys()],
    delete: vi.fn(async name => stores.delete(name)),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        put: (key, response) => put(name, key, response),
        match: async key => stores.get(name).get(new URL(typeof key === 'string' ? key : key.url, origin).href)?.clone(),
        keys: async () => [...stores.get(name).keys()].map(url => new Request(url))
      };
    }
  };
  const self = {
    location: new URL('/sw.js', origin), addEventListener: (type, callback) => { handlers[type] = callback; },
    skipWaiting: vi.fn(), clients: {
      claim: vi.fn(), matchAll: async () => states.map(state => ({ postMessage: (_, ports) => ports[0].postMessage(state) }))
    }
  };
  const fetch = vi.fn(async url => new Response(files[url] ?? 'missing', { status: url in files ? 200 : 404 }));
  const resources = Object.entries(files).map(([url, bytes]) => ({ url, revision: hash(bytes) }));
  vm.runInNewContext(template.replace('__STORM_VERSION__', '"A"').replace('__STORM_RESOURCES__', JSON.stringify(resources)), {
    self, caches, fetch, crypto: webcrypto, Response, URL, MessageChannel: Channel, setTimeout, clearTimeout, Uint8Array
  });
  const fire = async (type, data = {}) => {
    let done; let response;
    handlers[type]({ ...data, waitUntil: promise => { done = promise; }, respondWith: promise => { response = promise; } });
    await done;
    return response;
  };
  const request = (path, mode = 'cors') => fire('fetch', { request: { url: new URL(path, origin).href, method: 'GET', mode } });
  const seed = async (name, key = '/index.html', text = 'old') => (await caches.open(name)).put(key, new Response(text));
  return { self, caches, stores, put, fetch, fire, request, seed };
}

describe('release generation and install metadata', () => {
  it('generates a deterministic complete list including lazy CSS/JS, fonts and public files', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'storm-pwa-unit-'));
    try {
      await mkdir(resolve(directory, 'assets'));
      for (const file of ['index.html', 'manifest.json', 'assets/main.js', 'assets/map.css', 'assets/map.js', 'assets/exif.js', 'assets/font.woff2']) {
        await writeFile(resolve(directory, file), file);
      }
      await writeFile(resolve(directory, 'assets/main.js.map'), 'excluded');
      const first = await generateServiceWorker(directory, templatePath);
      expect(first.resources.map(item => item.url)).toEqual(expect.arrayContaining(['/assets/map.css', '/assets/map.js', '/assets/exif.js', '/assets/font.woff2']));
      expect(first.resources.some(item => item.url.endsWith('.map') || item.url === '/sw.js')).toBe(false);
      expect((await generateServiceWorker(directory, templatePath)).version).toBe(first.version);
      await writeFile(resolve(directory, 'index.html'), 'new release');
      expect((await generateServiceWorker(directory, templatePath)).version).not.toBe(first.version);
    } finally {
      if (!directory.startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup');
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('has consistent standalone metadata and valid icon dimensions', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
    expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/', display: 'standalone', lang: 'ru' });
    expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
    for (const icon of [...manifest.icons, { src: '/apple-touch-icon.png', sizes: '180x180' }]) {
      const bytes = await readFile(resolve('public', icon.src.slice(1)));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });
});

describe('service worker release lifecycle', () => {
  it('installs every verified resource without prematurely skipping waiting', async () => {
    const w = worker(); await w.fire('install');
    expect((await (await w.caches.open('storm-archive-app-A')).keys())).toHaveLength(3);
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
  });

  it.each(['network', 'changed bytes', 'quota'])('rolls back an incomplete install on %s and retains old caches', async failure => {
    const w = worker(); await w.seed('storm-archive-app-old'); await w.seed('another-app');
    if (failure === 'network') w.fetch.mockRejectedValueOnce(new Error('offline'));
    if (failure === 'changed bytes') w.fetch.mockResolvedValueOnce(new Response('wrong deployment'));
    if (failure === 'quota') w.put.mockRejectedValueOnce(new Error('quota'));
    await expect(w.fire('install')).rejects.toThrow();
    expect(await w.caches.keys()).toEqual(['storm-archive-app-old', 'another-app']);
  });

  it('serves version-pinned HTML without fetching a newer page from the network', async () => {
    const w = worker(); await w.fire('install'); w.fetch.mockClear();
    expect(await (await w.request('/?launch=pwa', 'navigate')).text()).toBe('release A');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('serves lazy assets from the previous release to an already open page', async () => {
    const w = worker(); await w.fire('install');
    await w.seed('storm-archive-app-old', '/assets/old-lazy.css', 'old style');
    expect(await (await w.request('/assets/old-lazy.css')).text()).toBe('old style');
  });

  it('does not intercept external tiles, POSTs, or unrelated same-origin resources', async () => {
    const w = worker();
    expect(await w.request('https://tile.openstreetmap.org/1/1/1.png')).toBeUndefined();
    expect(await w.request('/other-app/data')).toBeUndefined();
    expect(await w.fire('fetch', { request: { url: origin + '/assets/main-A.js', method: 'POST' } })).toBeUndefined();
  });

  it('does not cache arbitrary URLs or query-string variants and never returns HTML for missing CSS', async () => {
    const w = worker(); await w.fire('install');
    for (let i = 0; i < 15; i++) expect(await (await w.request(`/assets/map-A.css?${i}`)).text()).toBe('map');
    expect((await w.request('/assets/missing.css')).status).toBe(504);
    expect((await (await w.caches.open('storm-archive-app-A')).keys())).toHaveLength(3);
  });

  it('cleans only obsolete app caches and keeps one previous release', async () => {
    const w = worker(); await w.seed('foreign-cache'); await w.seed('storm-archive-cache-v4');
    await w.seed('storm-archive-app-previous'); await w.fire('install'); await w.fire('activate');
    expect(await w.caches.keys()).toEqual(['foreign-cache', 'storm-archive-app-previous', 'storm-archive-app-A']);
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('keeps old resources still used by an open page', async () => {
    const w = worker({ states: [{ entry: origin + '/assets/live.js', canUpdate: true }] });
    await w.seed('storm-archive-app-live', '/assets/live.js'); await w.seed('storm-archive-app-previous');
    await w.fire('install'); await w.fire('activate');
    expect(await w.caches.keys()).toContain('storm-archive-app-live');
  });

  it('does not delete old caches while a legacy client cannot identify its release', async () => {
    const w = worker({ states: [{ canUpdate: false }] });
    await w.seed('storm-archive-app-old'); await w.seed('storm-archive-app-previous');
    await w.fire('install'); await w.fire('activate');
    expect(await w.caches.keys()).toHaveLength(3);
  });

  it.each([true, false])('activates explicitly only if all clients are safe: %s', async canUpdate => {
    const w = worker({ states: [{ canUpdate: true }, { canUpdate }] });
    const postMessage = vi.fn();
    await w.fire('message', { data: { type: 'STORM_ACTIVATE' }, ports: [{ postMessage }] });
    expect(postMessage).toHaveBeenCalledWith({ ok: canUpdate });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(canUpdate ? 1 : 0);
  });

  it('keeps a working cache if repairing it fails', async () => {
    const w = worker(); await w.fire('install'); w.fetch.mockRejectedValueOnce(new Error('offline'));
    const postMessage = vi.fn();
    await w.fire('message', { data: { type: 'STORM_REPAIR' }, ports: [{ postMessage }] });
    expect(postMessage).toHaveBeenCalledWith({ ok: false });
    expect(await (await w.request('/', 'navigate')).text()).toBe('release A');
  });

  it('recovers an evicted current resource online after verifying its bytes', async () => {
    const w = worker(); await w.fire('install');
    w.stores.get('storm-archive-app-A').delete(origin + '/assets/map-A.css');
    expect(await (await w.request('/assets/map-A.css')).text()).toBe('map');
    expect((await (await w.caches.open('storm-archive-app-A')).keys())).toHaveLength(3);
  });

  it('rejects a different release when an evicted entry is fetched again', async () => {
    const w = worker(); await w.fire('install');
    w.stores.get('storm-archive-app-A').delete(origin + '/assets/map-A.css');
    w.fetch.mockResolvedValueOnce(new Response('<html>new release</html>'));
    expect((await w.request('/assets/map-A.css')).status).toBe(504);
    expect(await (await w.request('/', 'navigate')).text()).toBe('release A');
  });
});
