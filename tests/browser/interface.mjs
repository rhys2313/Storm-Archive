import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_CATEGORIES } from '../../src/types/storm.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.STORM_TEST_URL || 'http://127.0.0.1:6422';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'Local test server only');
const output = await mkdtemp(resolve(tmpdir(), 'storm-interface-browser-'));
const fixture = fileURLToPath(new URL('./fixtures/first.jpg', import.meta.url));
const bytes = await readFile(fixture);
const image = `data:image/jpeg;base64,${bytes.toString('base64')}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const results = [];
const ready = page => page.getByText('Приложение готово к работе без интернета.', { exact: true }).waitFor();
const stored = page => page.evaluate(() => new Promise((done, fail) => {
  const request = indexedDB.open('StormArchiveDB');
  request.onerror = () => fail(request.error);
  request.onsuccess = () => {
    const db = request.result; const tx = db.transaction('events', 'readonly'); const all = tx.objectStore('events').getAll();
    tx.oncomplete = () => { db.close(); done(all.result); }; tx.onerror = () => fail(tx.error);
  };
}));
const nav = (page, mobile) => page.locator(mobile ? '.mobile-bottom-nav' : '.desktop-nav');
const go = (page, mobile, name) => nav(page, mobile).getByRole('button', { name: new RegExp(`^${name}`) }).click();
const add = (page, mobile) => page.locator(mobile ? '.mobile-fab-btn' : '.add-event-btn').click();
async function screenshot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
}
function contrast(a, b) {
  const lum = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
async function seed(page) {
  await page.evaluate(image => new Promise((done, fail) => {
    const request = indexedDB.open('StormArchiveDB');
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('events', 'readwrite');
      for (let i = 0; i < 120; i++) {
        const category = ['mcs', 'hail', 'thunderstorm'][i % 3];
        tx.objectStore('events').add({ id: `ui-${String(i).padStart(3, '0')}`,
          title: i === 0 ? 'ОченьДлинноеНазвание'.repeat(10) : `Наблюдение ${String(i).padStart(3, '0')}`,
          date: `2025-${String(i % 12 + 1).padStart(2, '0')}-15T18:30`, createdAt: '2025-01-15T14:30:00Z',
          eventType: category, classification: { category, subtype: 'unspecified', attributes: category === 'mcs' ? { structuralFeatures: ['lewp'] } : {} },
          severity: i % 2 ? 'moderate' : 'severe', location: i === 0 ? 'Местонаблюдения'.repeat(30) : 'Полевые наблюдения',
          latitude: 56.5, longitude: 44.25, notes: 'Подробные полевые заметки. '.repeat(20), tags: ['грозы', 'ДлинныйТег'.repeat(15)],
          photos: i % 4 === 0 ? Array.from({ length: i === 0 ? 24 : 3 }, (_, index) => ({ id: `p-${i}-${index}`, url: image, thumb: image, exif: {}, caption: `Снимок ${index + 1}` })) : [] });
      }
      tx.oncomplete = () => { db.close(); done(); }; tx.onerror = () => fail(tx.error);
    };
  }), image);
}

try {
  for (const [width, height] of [[320, 900], [390, 844], [768, 900], [820, 900], [1024, 900], [1440, 900], [844, 390]]) {
    const mobile = width <= 768;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Europe/Astrakhan' });
    await context.route('https://tile.openstreetmap.org/**', route => route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url); await ready(page);
      await page.getByRole('heading', { name: 'Ваш Storm Archive пуст', exact: true }).waitFor();
      await screenshot(page, `empty-${width}x${height}`);
      const header = await page.locator('.header-container').evaluate(el => {
        const logo = el.querySelector('.logo-section').getBoundingClientRect();
        const navigation = el.querySelector('.desktop-nav').getBoundingClientRect();
        const actions = el.querySelector('.header-actions').getBoundingClientRect();
        return { logoRight: logo.right, navLeft: navigation.left, navRight: navigation.right, navWidth: navigation.width, actionsLeft: actions.left };
      });
      assert(header.logoRight <= (header.navWidth ? header.navLeft : header.actionsLeft), `Brand overlap ${width}`);
      if (header.navWidth) assert(header.navRight <= header.actionsLeft, `Navigation overlap ${width}`);
      assert.equal(await page.locator('.add-event-btn').isVisible(), !mobile);
      await seed(page); await page.reload(); await ready(page);
      await page.locator('.event-card').first().waitFor();
      assert.equal(await page.locator('.event-card').count(), 36);
      const original = await stored(page);
      await screenshot(page, `archive-${width}x${height}`);
      await page.getByRole('button', { name: 'Показать ещё наблюдения', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.event-card').length === 72);
      await page.waitForFunction(() => !!document.activeElement.closest('.event-card'));
      await page.evaluate(() => scrollTo(0, 1800));
      await go(page, mobile, 'Галерея');
      await page.waitForFunction(() => scrollY === 0);
      await page.getByLabel('Фильтр по группе явлений', { exact: true }).selectOption('mcs');
      assert.equal(await page.locator('.gallery-card').count(), 48);
      await page.getByRole('button', { name: 'Показать ещё снимки', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 51);
      const badge = await page.locator('.gallery-badge').first().evaluate(el => ({ text: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
      assert(contrast(badge.text, badge.bg) >= 4.5);
      await page.evaluate(() => scrollTo(0, 1000));
      await go(page, mobile, 'Статистика'); await page.waitForFunction(() => scrollY === 0);
      await screenshot(page, `stats-${width}x${height}`);
      assert.match(await page.getByRole('img', { name: /Количество наблюдений по месяцам:/ }).getAttribute('aria-label'), /Июн — 10/);
      await page.goBack();
      await page.getByLabel('Фильтр по группе явлений', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Фильтр по группе явлений', { exact: true }).inputValue(), 'mcs');
      assert.equal(await page.locator('.gallery-card').count(), 51);
      await page.waitForFunction(() => Math.abs(scrollY - 1000) < 2);
      await page.goForward(); await page.getByRole('heading', { name: 'Статистика', exact: true }).waitFor();
      await go(page, mobile, 'Архив');
      await page.waitForFunction(() => Math.abs(scrollY - 1800) < 2);
      assert.equal(await page.locator('.event-card').count(), 72);
      const search = page.getByLabel('Поиск по архиву', { exact: true });
      await search.fill('НичегоТакогоВАрхивеНет');
      await page.getByRole('heading', { name: 'Ничего не найдено', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
      await search.fill('ОченьДлинноеНазвание');
      await page.waitForFunction(() => document.querySelectorAll('.event-card').length === 1);
      await page.locator('.card-title-btn').focus(); await page.keyboard.press('Enter');
      const detail = page.getByRole('dialog'); await detail.waitFor();
      const dimensions = await detail.evaluate(el => ({ header: el.querySelector('.modal-header').clientHeight, body: el.querySelector('.modal-body').clientHeight }));
      assert(dimensions.header < 110 && dimensions.body > height * .35, JSON.stringify(dimensions));
      await screenshot(page, `detail-${width}x${height}`);
      await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
      const dateBefore = await page.locator('#field-date').inputValue();
      assert.equal(await page.locator('.form-photo-row:visible').count(), 4);
      await page.getByRole('button', { name: 'Просмотреть снимок 1', exact: true }).click();
      await page.getByRole('dialog', { name: /Просмотр фотографии 1 из 24/ }).waitFor();
      await page.locator('.lightbox-image').evaluate(img => img.decode());
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Редактирование наблюдения', exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Просмотреть снимок 1', exact: true }).evaluate(el => el === document.activeElement));
      await page.locator('#photo-upload-input').setInputFiles(fixture);
      await page.waitForFunction(() => document.querySelectorAll('.form-photo-row').length === 25);
      assert.equal(await page.locator('#field-date').inputValue(), dateBefore);
      await page.getByRole('button', { name: 'Показать остальные снимки (21)', exact: true }).click();
      await page.getByLabel('Подпись к снимку 24', { exact: true }).fill('Уточнённая подпись');
      await page.getByRole('button', { name: 'Свернуть список снимков', exact: true }).click();
      await page.locator('#field-notes').scrollIntoViewIfNeeded();
      await screenshot(page, `form-${width}x${height}`);
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const saved = await stored(page);
      assert.deepEqual(saved.filter(item => item.id !== 'ui-000'), original.filter(item => item.id !== 'ui-000'));
      const edited = saved.find(item => item.id === 'ui-000');
      const previous = original.find(item => item.id === 'ui-000');
      assert.equal(edited.photos.length, 25); assert.equal(edited.photos[23].caption, 'Уточнённая подпись');
      assert.deepEqual(edited.photos.slice(0, 23), previous.photos.slice(0, 23));
      assert.equal(edited.date, previous.date);

      await add(page, mobile);
      await page.locator('.modal-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.getByRole('button', { name: 'Сохранить в архив', exact: true }).click();
      await page.waitForFunction(() => document.activeElement.id === 'field-title');
      const fieldBounds = await page.locator('#field-title').boundingBox();
      assert(fieldBounds.y >= 0 && fieldBounds.y + fieldBounds.height < height);
      await screenshot(page, `validation-${width}x${height}`);
      await page.locator('#field-title').fill('Несохранённая запись');
      await page.getByLabel('Широта', { exact: true }).fill('56');
      await page.getByRole('button', { name: 'Сохранить в архив', exact: true }).click();
      await page.waitForFunction(() => document.activeElement.id === 'field-longitude');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
      assert.equal(await page.locator('#field-title').inputValue(), 'Несохранённая запись');
      if (width === 1440) {
        await page.goBack();
        await page.waitForFunction(() => location.hash === '#stats');
        assert.equal(await page.locator('#field-title').inputValue(), 'Несохранённая запись');
        assert(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'History does not steal draft focus');
      }
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      if (width === 1440) {
        await page.waitForFunction(() => scrollY === 0 && document.activeElement.tagName === 'MAIN');
      }
      await go(page, mobile, 'Карта');
      await page.locator('.leaflet-marker-icon').waitFor();
      assert.equal(await page.locator('.leaflet-marker-icon').count(), 1, 'Co-located observations share one selectable marker');
      await page.locator('.leaflet-marker-icon').click();
      await page.getByRole('heading', { name: 'Наблюдений в этой точке: 120', exact: true }).waitFor();
      assert.equal(await page.locator('.map-popup-list button').count(), 120);
      await page.locator('.map-popup-list').getByRole('button', { name: /Наблюдение 119$/ }).click();
      await page.getByRole('dialog', { name: 'Наблюдение 119', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.map-popup-list').getByRole('button', { name: /ОченьДлинноеНазвание/ }).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      assert.deepEqual(await stored(page), saved);
      await page.getByRole('button', { name: 'Данные и резервные копии', exact: true }).click();
      await screenshot(page, `backup-${width}x${height}`);
      assert.equal(await page.locator('.storage-summary .storage-check').count(), 1);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
      assert.deepEqual(JSON.parse(await readFile(await (await download).path(), 'utf8')).events, saved);
      await page.locator('.backup-modal input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
      await page.locator('.backup-modal .inline-alert.danger').waitFor();
      assert.deepEqual(await stored(page), saved);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      results.push(`${width}×${height}`); console.log(`PASS interface ${width}×${height}`);
    } finally { await context.close(); }
  }

  // A readable record containing undecodable image bytes remains exportable.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url); await ready(page);
  await page.evaluate(() => new Promise(done => {
    const r = indexedDB.open('StormArchiveDB'); r.onsuccess = () => {
      const db = r.result, tx = db.transaction('events', 'readwrite');
      tx.objectStore('events').add({ id: 'broken', title: 'Снимок с ошибкой', date: '', eventType: 'other', severity: 'moderate', photos: [{ id: 'bad', url: 'data:image/jpeg;base64,YmFk', caption: 'Исходник сохранён' }] });
      tx.oncomplete = () => { db.close(); done(); };
    };
  }));
  await page.reload(); const before = await stored(page);
  await page.getByRole('button', { name: 'Снимок с ошибкой', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть снимок 1 из 1', exact: true }).click();
  await page.locator('.lightbox-stage .image-unavailable').waitFor();
  await screenshot(page, 'unavailable-photo'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  assert.deepEqual(await stored(page), before);
  await context.close(); results.push('unavailable photo retained');

  const palette = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const colors = await palette.newPage(); await colors.goto(url); await ready(colors);
  await colors.evaluate(({ categories, image }) => new Promise(done => {
    const request = indexedDB.open('StormArchiveDB'); request.onsuccess = () => {
      const db = request.result, tx = db.transaction('events', 'readwrite');
      categories.forEach(category => tx.objectStore('events').add({ id: category.id, title: category.label,
        date: '2025-06-15T18:30', eventType: category.id, severity: 'moderate', photos: [{ id: 'color', url: image, thumb: image }] }));
      tx.oncomplete = () => { db.close(); done(); };
    };
  }), { categories: Object.values(EVENT_CATEGORIES), image });
  await colors.reload(); await colors.locator('.event-card').first().waitFor();
  for (const card of await colors.locator('.event-card').all()) {
    await card.hover();
    const pair = await card.locator('.type-badge').evaluate(el => ({ text: getComputedStyle(el).color,
      tint: getComputedStyle(el).backgroundColor, surface: getComputedStyle(el.closest('.event-card')).backgroundColor }));
    const tint = pair.tint.match(/[\d.]+/g).map(Number), surface = pair.surface.match(/[\d.]+/g).map(Number);
    const background = `rgb(${surface.slice(0, 3).map((value, i) => value * (1 - tint[3]) + tint[i] * tint[3]).join(',')})`;
    assert(contrast(pair.text, background) >= 4.5, JSON.stringify(pair));
  }
  await go(colors, false, 'Галерея');
  for (const badge of await colors.locator('.gallery-badge').all()) {
    const pair = await badge.evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    assert(contrast(pair.text, pair.background) >= 4.5, JSON.stringify(pair));
  }
  await palette.close(); results.push('category palette contrast');

  const unavailable = await browser.newContext({ viewport: { width: 320, height: 844 } });
  await unavailable.addInitScript(() => {
    Object.defineProperty(indexedDB, 'open', { value: () => { throw new Error('Unavailable test database'); } });
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { if (key === 'storm_archive_events') throw new Error('Unavailable test fallback'); return get.call(this, key); };
  });
  const failed = await unavailable.newPage(); await failed.goto(url);
  await failed.getByRole('heading', { name: 'Основной архив недоступен', exact: true }).waitFor();
  assert.equal(await failed.getByText(/Новые записи сохраняются/).count(), 0);
  for (const name of ['Галерея', 'Статистика', 'Карта']) {
    await go(failed, true, name);
    await failed.getByRole('heading', { name: 'Основной архив недоступен', exact: true }).waitFor();
  }
  await screenshot(failed, 'unavailable-archive');
  await unavailable.close(); results.push('unavailable archive across sections');
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: results.length, scenarios: results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, scenarios: results, output }, null, 2));
} finally { await browser.close(); }
