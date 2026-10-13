// Self-contained production/SW regression. Uses isolated contexts and temporary
// builds, never a user's browser profile. Supply Playwright externally.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'storm-pwa-browser-'));
const releases = { A: resolve(temporary, 'A'), B: resolve(temporary, 'B'), C: resolve(temporary, 'C') };
await cp(resolve(root, 'dist'), releases.A, { recursive: true });
for (const version of ['B', 'C']) {
  assert(releases[version].startsWith(temporary + sep), 'Temporary build output only');
  await build({ root, configFile: resolve(root, 'vite.config.js'), logLevel: 'error',
    build: { outDir: releases[version], emptyOutDir: true },
    plugins: [{ name: 'test-release', enforce: 'pre', transform(code, id) {
      if (id.endsWith('/src/main.jsx')) return code + `\nconsole.info('PWA regression release ${version}');`;
    } }]
  });
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
let directory = releases.A;
let failCSS = false;
let server;
let port = 0;
let url;
let persistent;
let installabilityVerified = false;
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
async function startServer() {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (failCSS && /\/assets\/MapView-.*\.css$/.test(path)) { response.writeHead(503); response.end('unavailable'); return; }
      const file = resolve(directory, path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(directory + sep)) { response.writeHead(403); response.end(); return; }
      let bytes;
      try { bytes = await readFile(file); }
      catch { response.writeHead(404); response.end('missing'); return; }
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise(done => server.listen(port, '127.0.0.1', done));
  port = server.address().port;
  url = `http://127.0.0.1:${port}`;
}
const stopServer = async () => { if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); } };
await startServer();
const results = [];
const fixture = fileURLToPath(new URL('./fixtures/first.jpg', import.meta.url));
async function context(mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile, hasTouch: mobile, timezoneId: 'Europe/Astrakhan' });
  await ctx.route('https://tile.openstreetmap.org/**', route => route.abort());
  ctx.on('page', page => { page.setDefaultTimeout(20000); });
  return ctx;
}
const ready = page => page.getByText('Приложение готово к работе без интернета.', { exact: true }).waitFor();
const nav = (page, mobile = false) => page.locator(mobile ? '.mobile-bottom-nav' : '.desktop-nav');
const add = (page, mobile = false) => page.locator(mobile ? '.mobile-fab-btn' : '.add-event-btn').click();
async function save(page, title, { photo = false, mobile = false } = {}) {
  await add(page, mobile);
  await page.locator('#field-title').fill(title);
  if (photo) {
    await page.locator('#photo-upload-input').setInputFiles(fixture);
    await page.waitForFunction(() => document.querySelectorAll('.form-photo-row').length === 1);
  }
  await page.getByRole('button', { name: 'Сохранить в архив', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
const records = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('StormArchiveDB');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result; const tx = db.transaction('events', 'readonly');
    const all = tx.objectStore('events').getAll();
    tx.oncomplete = () => { db.close(); resolve(all.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
}));
async function entryOf(release) {
  const html = await readFile(resolve(release, 'index.html'), 'utf8');
  return html.match(/<script[^>]+src="([^"]+)"/)[1];
}
const currentEntry = page => page.locator('script[type="module"][src]').getAttribute('src');
async function waitEntry(page, release) {
  await page.waitForFunction(expected => document.querySelector('script[type="module"][src]')?.getAttribute('src') === expected, await entryOf(release));
  await ready(page);
}
const checkUpdate = page => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
const updateReady = page => page.getByRole('button', { name: 'Обновить приложение', exact: true }).waitFor();
const cachesOf = page => page.evaluate(() => caches.keys());
async function sentinels(page) {
  await page.evaluate(async () => {
    localStorage.setItem('pwa-regression-sentinel', 'keep');
    await (await caches.open('foreign-application-cache')).put('/foreign-sentinel', new Response('keep'));
  });
}
async function retained(page) {
  assert.equal(await page.evaluate(() => localStorage.getItem('pwa-regression-sentinel')), 'keep');
  assert.equal(await page.evaluate(async () => (await (await caches.open('foreign-application-cache')).match('/foreign-sentinel'))?.text()), 'keep');
}
async function scenario(name, run) {
  try { await run(); results.push(name); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

try {
  for (const mobile of [false, true]) await scenario(`offline lifecycle ${mobile ? 'mobile' : 'desktop'}`, async () => {
    directory = releases.A; failCSS = false;
    const ctx = await context(mobile);
    try {
      let page = await ctx.newPage(); const errors = [];
      ctx.on('page', current => current.on('pageerror', error => errors.push(error.message)));
      await page.goto(url); await ready(page);
      const protocol = await ctx.newCDPSession(page);
      const manifest = await protocol.send('Page.getAppManifest');
      assert.deepEqual(manifest.errors, []);
      const installErrors = (await protocol.send('Page.getInstallabilityErrors')).installabilityErrors;
      assert(installErrors.every(error => error.errorId === 'in-incognito'), JSON.stringify(installErrors));
      await protocol.detach();
      await save(page, 'Online record', { mobile }); await sentinels(page);
      await page.close();
      await stopServer(); await ctx.setOffline(true);
      page = await ctx.newPage(); await page.goto(url); await ready(page);
      await page.getByRole('heading', { name: 'Online record', exact: true }).waitFor();
      await page.reload(); await ready(page);
      for (const name of ['Галерея', 'Статистика', 'Карта']) await nav(page, mobile).getByRole('button', { name, exact: true }).click();
      await page.getByRole('application', { name: 'Карта наблюдений' }).waitFor();
      await page.getByText(/Подложка карты недоступна/).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(temporary, `offline-map-${mobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' });
      await save(page, 'Offline photo record', { mobile, photo: true });
      await page.locator('.leaflet-marker-icon').click();
      await page.getByRole('button', { name: 'Открыть наблюдение', exact: true }).click();
      const detail = page.getByRole('dialog', { name: 'Offline photo record', exact: true });
      await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
      assert.equal(await page.locator('#field-date').inputValue(), '2020-06-15T18:30');
      await page.locator('#field-title').fill('Edited offline');
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const saved = await records(page);
      await page.reload(); await ready(page);
      await nav(page, mobile).getByRole('button', { name: /^Архив/ }).click();
      await page.getByRole('heading', { name: 'Edited offline', exact: true }).click();
      await page.getByRole('button', { name: 'Открыть снимок 1 из 1', exact: true }).click();
      await page.locator('.lightbox-image').evaluate(image => image.decode());
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Данные и резервные копии', exact: true }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
      const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
      assert.deepEqual(backup.events, saved);
      await page.keyboard.press('Escape'); await retained(page);
      const sizes = await page.evaluate(async () => {
        const name = (await caches.keys()).find(name => name.startsWith('storm-archive-app-'));
        const cache = await caches.open(name); const before = (await cache.keys()).length;
        const css = (await cache.keys()).find(request => request.url.endsWith('.css')).url;
        for (let i = 0; i < 20; i++) await fetch(css + '?variant=' + i);
        return { before, after: (await cache.keys()).length };
      });
      assert.equal(sizes.before, sizes.after);
      assert.equal(await page.locator('.online-badge.offline').count(), 1);
      await nav(page, mobile).getByRole('button', { name: 'Карта', exact: true }).click();
      await page.getByText(/Подложка карты недоступна/).waitFor();
      // Validate tile retry with a controlled image response, not a dependency
      // on the public tile service's availability or rate limits.
      let retriedTiles = 0;
      await ctx.unroute('https://tile.openstreetmap.org/**');
      await ctx.route('https://tile.openstreetmap.org/**', async route => {
        retriedTiles++;
        await route.fulfill({ contentType: 'image/jpeg', body: await readFile(fixture) });
      });
      await startServer(); await ctx.setOffline(false);
      await page.locator('.online-badge.online').waitFor();
      await page.getByText(/Подложка карты недоступна/).waitFor({ state: 'hidden' });
      assert(retriedTiles > 0, 'Visible map tiles retry on reconnection');
      await page.reload(); await ready(page);
      assert.deepEqual(await records(page), saved);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(temporary, `offline-${mobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' });
    } finally { await ctx.close(); if (!server.listening) await startServer(); }
  });

  await scenario('updates A → B → failed C → C, multiple windows and data preservation', async () => {
    directory = releases.A;
    const ctx = await context();
    try {
      const page = await ctx.newPage(); await page.goto(url); await ready(page);
      await save(page, 'Persistent photo', { photo: true }); await sentinels(page);
      const second = await ctx.newPage(); await second.goto(url); await ready(second);
      await add(second); await second.locator('#field-title').fill('Other window draft');
      await add(page); await page.locator('#field-title').fill('Unsaved draft');
      directory = releases.B; await checkUpdate(page); await updateReady(page);
      assert(await page.getByRole('button', { name: 'Обновить приложение', exact: true }).isDisabled());
      assert.equal(await page.locator('#field-title').inputValue(), 'Unsaved draft');
      assert.equal(await currentEntry(page), await entryOf(releases.A));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
      await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click();
      await page.getByText(/Завершите действия в других окнах/).waitFor();
      assert.equal(await second.locator('#field-title').inputValue(), 'Other window draft');
      await second.getByRole('button', { name: 'Сохранить в архив', exact: true }).click();
      await second.getByRole('dialog').waitFor({ state: 'hidden' });
      const saved = await records(second);
      await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click();
      await waitEntry(page, releases.B); await waitEntry(second, releases.B);
      assert.deepEqual(await records(page), saved); await retained(page);
      const before = (await cachesOf(page)).sort();
      directory = releases.C; failCSS = true;
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration.update(); const worker = registration.installing;
        if (worker) await new Promise(resolve => {
          if (worker.state === 'redundant') return resolve();
          worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
        });
      });
      assert.equal(await currentEntry(page), await entryOf(releases.B));
      assert.deepEqual((await cachesOf(page)).sort(), before);
      failCSS = false; await checkUpdate(page); await updateReady(page);
      await page.getByRole('button', { name: 'Обновить приложение', exact: true }).click();
      await waitEntry(page, releases.C); await waitEntry(second, releases.C);
      assert.deepEqual(await records(page), saved); await retained(page);
      await page.waitForFunction(async () => (await caches.keys()).filter(name => name.startsWith('storm-archive-app-')).length === 2);
      await second.close(); await page.close(); await stopServer(); await ctx.setOffline(true);
      const cold = await ctx.newPage(); await cold.goto(url); await ready(cold);
      assert.equal(await currentEntry(cold), await entryOf(releases.C));
      assert.deepEqual(await records(cold), saved);
    } finally { failCSS = false; await ctx.close(); if (!server.listening) await startServer(); }
  });

  await scenario('failed first installation and retry', async () => {
    directory = releases.A; failCSS = true;
    const ctx = await context();
    try {
      const page = await ctx.newPage(); await page.goto(url);
      await page.getByText('Не удалось подготовить офлайн-версию. Подключитесь к сети и повторите.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), false);
      assert.deepEqual((await cachesOf(page)).filter(name => name.startsWith('storm-archive-app-')), []);
      await save(page, 'Saved despite failed preparation'); const saved = await records(page);
      failCSS = false;
      await page.getByRole('button', { name: 'Повторить подготовку', exact: true }).click();
      await ready(page); await page.close(); await stopServer(); await ctx.setOffline(true);
      const next = await ctx.newPage(); await next.goto(url); await ready(next);
      assert.deepEqual(await records(next), saved);
    } finally { failCSS = false; await ctx.close(); if (!server.listening) await startServer(); }
  });

  if (process.env.STORM_LEGACY_DIST) await scenario('migration from actual legacy production worker', async () => {
    directory = resolve(process.env.STORM_LEGACY_DIST);
    const ctx = await context();
    try {
      const page = await ctx.newPage(); await page.goto(url); await page.evaluate(() => navigator.serviceWorker.ready);
      await save(page, 'Legacy photo', { photo: true }); await sentinels(page);
      const previousCaches = (await cachesOf(page)).filter(name => name.startsWith('storm-archive-app-') || /^storm-archive-cache-v\d+$/.test(name));
      await add(page); await page.locator('#field-title').fill('Legacy unfinished work');
      directory = releases.A; await checkUpdate(page);
      await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
      assert.equal(await page.locator('#field-title').inputValue(), 'Legacy unfinished work');
      await page.getByRole('button', { name: 'Сохранить в архив', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const saved = await records(page); await page.close();
      const next = await ctx.newPage(); await next.goto(url);
      // An immediate reopen can race the browser's normal waiting→active job.
      // The new client can also finish this transition via its ordinary offer.
      await next.waitForFunction(() => document.body.textContent.includes('Приложение готово к работе без интернета.') ||
        [...document.querySelectorAll('button')].some(button => button.textContent === 'Обновить приложение'));
      const offer = next.getByRole('button', { name: 'Обновить приложение', exact: true });
      if (await offer.isVisible()) await offer.click();
      await waitEntry(next, releases.A);
      assert.deepEqual(await records(next), saved); await retained(next);
      directory = releases.B; await checkUpdate(next); await updateReady(next);
      await next.getByRole('button', { name: 'Обновить приложение', exact: true }).click();
      await waitEntry(next, releases.B);
      await next.waitForFunction(async previous => {
        const current = await caches.keys(); return previous.every(name => !current.includes(name));
      }, previousCaches);
      assert.deepEqual(await records(next), saved); await retained(next);
    } finally { await ctx.close(); }
  });

  await scenario('normal-profile installability and full browser restart without server', async () => {
    await browser.close();
    directory = releases.C;
    const profile = resolve(temporary, 'chrome-profile');
    assert(profile.startsWith(temporary + sep), 'Isolated persistent test profile only');
    const options = { headless: true, viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Astrakhan',
      ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) };
    persistent = await chromium.launchPersistentContext(profile, options);
    let page = await persistent.newPage(); page.setDefaultTimeout(20000);
    await page.goto(url); await ready(page);
    const protocol = await persistent.newCDPSession(page);
    assert.deepEqual((await protocol.send('Page.getAppManifest')).errors, []);
    assert.deepEqual((await protocol.send('Page.getInstallabilityErrors')).installabilityErrors, []);
    installabilityVerified = true;
    await protocol.detach();
    await save(page, 'Persisted across browser restart', { photo: true }); await sentinels(page);
    const saved = await records(page);
    await stopServer(); await persistent.close(); persistent = null;
    persistent = await chromium.launchPersistentContext(profile, options);
    await persistent.setOffline(true);
    page = await persistent.newPage(); page.setDefaultTimeout(20000);
    await page.goto(url); await ready(page);
    assert.equal(await currentEntry(page), await entryOf(releases.C));
    assert.deepEqual(await records(page), saved); await retained(page);
    await page.getByRole('heading', { name: 'Persisted across browser restart', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть снимок 1 из 1', exact: true }).click();
    await page.locator('.lightbox-image').evaluate(image => image.decode());
    await persistent.close(); persistent = null;
  });
  const report = { passed: results.length, scenarios: results, installabilityVerified, temporaryBuilds: temporary };
  await writeFile(resolve(temporary, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await persistent?.close(); await browser.close(); await stopServer(); }
