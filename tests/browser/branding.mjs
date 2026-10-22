// Production assets and real Chromium rendering, isolated from user profiles.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const url = process.env.STORM_TEST_URL || 'http://127.0.0.1:6422';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Local preview only');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = await mkdtemp(resolve(tmpdir(), 'storm-branding-browser-'));
const options = { headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) };
const browser = await chromium.launch(options);
const metadata = JSON.parse(await readFile('resources/branding/assets.json', 'utf8'));
const prefix = `/branding/${metadata.version}/`;
const results = [];
const ready = page => page.getByRole('status', { name: 'Приложение готово к работе без интернета.', exact: true }).waitFor({ timeout: 45000 });
let persistent;

async function pixels(page, path) {
  return page.evaluate(async path => {
    const image = new Image(); image.src = path; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let radius = 0, transparent = 0, bright = 0;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (data[i + 3] !== 255) transparent++;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 100) {
        bright++; minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        radius = Math.max(radius, Math.hypot(x + .5 - canvas.width / 2, y + .5 - canvas.height / 2));
      }
    }
    return { width: canvas.width, height: canvas.height, radius, transparent, bright, bounds: [minX, minY, maxX, maxY] };
  }, path);
}

async function brandImages(page, width, theme) {
  const logos = page.locator('img.storm-mark');
  assert.equal(await logos.count(), 2, 'Header and empty archive use the same logo');
  for (const logo of await logos.all()) {
    await logo.evaluate(image => image.decode());
    assert.equal(await logo.getAttribute('src'), prefix + (theme === 'dark' ? 'logo.png' : 'logo-on-light.png'));
    const state = await logo.evaluate(image => {
      const css = getComputedStyle(image), box = image.getBoundingClientRect();
      return { natural: image.naturalWidth, width: box.width, height: box.height, filter: css.filter, rendering: css.imageRendering, fit: css.objectFit };
    });
    assert.equal(state.natural, 576); assert.equal(state.width, state.height);
    assert.equal(state.filter, 'none'); assert.equal(state.rendering, 'auto'); assert.equal(state.fit, 'contain');
  }
  assert.equal((await page.locator('.brand .storm-mark').boundingBox()).width, width <= 760 ? 36 : 48);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
}

try {
  for (const [theme, width, height, deviceScaleFactor] of [
    ['light', 1440, 960, 1], ['dark', 1440, 960, 2],
    ['light', 390, 844, 3], ['dark', 390, 844, 2],
    ['light', 820, 1100, 1], ['dark', 320, 900, 1]
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, colorScheme: theme, isMobile: width <= 760, hasTouch: width <= 760, locale: 'ru-RU' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await context.addInitScript(theme => localStorage.setItem('storm_archive_theme', theme), theme);
      await page.goto(url); await ready(page); await page.evaluate(() => document.fonts.ready);
      await brandImages(page, width, theme);
      await page.screenshot({ path: resolve(output, `${theme}-${width}.png`), animations: 'disabled', fullPage: true });
      await context.setOffline(true); await page.reload(); await ready(page); await brandImages(page, width, theme);
      assert.deepEqual(errors, []);
      results.push(`${theme} ${width}: both logos and offline reload`);
      console.log('PASS ' + results.at(-1));
    } finally { await context.close(); }
  }

  // A temporary non-incognito profile permits real installability diagnostics.
  persistent = await chromium.launchPersistentContext(resolve(output, 'test-profile'), { ...options, viewport: { width: 1280, height: 900 } });
  const page = await persistent.newPage();
  await page.goto(url); await ready(page);
  const cdp = await persistent.newCDPSession(page);
  const manifestResult = await cdp.send('Page.getAppManifest');
  assert.deepEqual(manifestResult.errors, []);
  const manifest = JSON.parse(manifestResult.data);
  assert.equal(manifest.name, 'Storm Archive');
  assert.deepEqual(manifest.icons.map(icon => icon.src), [prefix + 'pwa-192.png', prefix + 'pwa-512.png', prefix + 'pwa-maskable-512.png']);
  assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, []);
  await cdp.detach();
  const icons = await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(links => links.map(link => ({ path: link.getAttribute('href'), sizes: link.getAttribute('sizes') })));
  assert.equal(icons.length, 4);
  const paths = [prefix + 'logo.png', prefix + 'logo-on-light.png', ...manifest.icons.map(icon => icon.src), ...icons.map(icon => icon.path)];
  for (const path of paths) {
    const response = await page.request.get(url + path);
    assert.equal(response.status(), 200, path);
    const local = await readFile(resolve('public', new URL(path, url).pathname.slice(1)));
    assert((await response.body()).equals(local), 'Actual served asset matches repository: ' + path);
  }
  for (const size of [16, 32, 180, 192, 512]) {
    const name = size === 180 ? 'apple-touch-icon' : size < 180 ? `favicon-${size}` : `pwa-${size}`;
    const image = await pixels(page, prefix + name + '.png');
    assert.equal(image.width, size); assert.equal(image.height, size);
    assert.equal(image.transparent, 0); assert(image.bright > 0);
    assert(image.bounds[0] > 0 && image.bounds[1] > 0 && image.bounds[2] < size - 1 && image.bounds[3] < size - 1, 'No clipped artwork: ' + name);
  }
  const maskable = await pixels(page, prefix + 'pwa-maskable-512.png');
  assert.equal(maskable.transparent, 0); assert(maskable.bright > 1000);
  assert(maskable.radius < .4 * 512, 'Every meaningful pixel fits the guaranteed maskable safe circle');
  const ico = await pixels(page, `/favicon.ico?v=${metadata.version}`);
  assert.equal(ico.width, 256); assert.equal(ico.height, 256);
  assert.equal(ico.transparent, 0); assert(ico.bright > 1000);
  const transparentLogos = await page.evaluate(async prefix => {
    const states = [];
    for (const name of ['logo.png', 'logo-on-light.png']) {
      const image = new Image(); image.src = prefix + name; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 288;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 288, 288);
      const data = ctx.getImageData(0, 0, 288, 288).data;
      const alpha = []; let badMargin = 0, opaque = 0, partial = 0;
      for (let y = 0; y < 288; y++) for (let x = 0; x < 288; x++) {
        const a = data[(y * 288 + x) * 4 + 3]; alpha.push(a);
        if ((x < 10 || y < 10 || x >= 278 || y >= 278) && a) badMargin++;
        if (a === 255) opaque++; else if (a) partial++;
      }
      states.push({ name, alpha, badMargin, opaque, partial, inner: data[(120 * 288 + 100) * 4 + 3], ink: [...data.slice((50 * 288 + 50) * 4, (50 * 288 + 50) * 4 + 3)] });
    }
    return states;
  }, prefix);
  assert.deepEqual(transparentLogos[0].alpha, transparentLogos[1].alpha, 'Same geometry in both contrast variants');
  for (const logo of transparentLogos) {
    assert.equal(logo.badMargin, 0); assert.equal(logo.inner, 0);
    assert(logo.opaque > 30000); assert(logo.partial > 50);
    assert.deepEqual(logo.ink, logo.name === 'logo.png' ? [255, 255, 255] : [27, 32, 26]);
  }
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  for (const [label, theme] of [['Тёмная', 'dark'], ['Светлая', 'light']]) {
    await page.getByRole('radio', { name: new RegExp(label) }).check();
    await brandImages(page, 1280, theme);
  }
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-state="closing"]'));
  // A second check is made through the worker, with network requests disabled.
  await page.evaluate(() => localStorage.setItem('branding-test-sentinel', 'preserve'));
  await persistent.setOffline(true); await page.reload(); await ready(page);
  const offline = await page.evaluate(async paths => {
    return Promise.all(paths.map(async path => {
      const response = await fetch(path);
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return { path, status: response.status, hash };
    }));
  }, paths);
  for (const response of offline) {
    assert.equal(response.status, 200);
    const local = await readFile(resolve('public', new URL(response.path, url).pathname.slice(1)));
    assert.equal(response.hash, createHash('sha256').update(local).digest('hex'));
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('branding-test-sentinel')), 'preserve');
  results.push('Chromium installability, actual icon bytes, PNG bounds, maskable safe zone and offline hashes');
  console.log('PASS ' + results.at(-1));
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: results.length, scenarios: results, icons, maskable, osInstallationTested: false }, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }, null, 2));
} finally {
  await persistent?.close(); await browser.close();
}
