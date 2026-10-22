// Production-only UI regression. Every scenario owns a fresh browser context.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.STORM_TEST_URL || 'http://127.0.0.1:6422';
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
  'Local preview only'
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : {})
});
const output = await mkdtemp(resolve(tmpdir(), 'storm-redesign-browser-'));
const fixture = fileURLToPath(new URL('./fixtures/first.jpg', import.meta.url));
const results = [];
const settle = (page) =>
  page.waitForFunction(() => !document.querySelector('[data-state="closing"]'));
const ready = (page) =>
  page
    .getByRole('status', {
      name: 'Приложение готово к работе без интернета.',
      exact: true
    })
    .waitFor({ timeout: 45000 });
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((done, fail) => {
        const request = indexedDB.open('StormArchiveDB');
        request.onerror = fail;
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('events', 'readonly'),
            all = tx.objectStore('events').getAll();
          tx.oncomplete = () => {
            db.close();
            done(all.result);
          };
          tx.onerror = fail;
        };
      })
  );
const screenshot = (page, name) =>
  page.screenshot({
    path: resolve(output, name + '.png'),
    animations: 'disabled'
  });

async function scenario(name, options, run) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    timezoneId: 'Europe/Astrakhan',
    locale: 'ru-RU',
    ...options
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort()
  );
  try {
    await run(page, context);
    assert.deepEqual(errors, []);
    results.push(name);
    console.log('PASS ' + name);
  } catch (error) {
    await screenshot(page, 'failure-' + results.length);
    console.log('Artifacts: ' + output);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  for (const [theme, width, height] of [
    ['light', 1440, 960],
    ['dark', 390, 844],
    ['light', 320, 900],
    ['dark', 820, 1100]
  ]) {
    const mobile = width <= 760;
    await scenario(
      `${theme} ${width}: classification, materials, appearance, offline, backup`,
      {
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
        colorScheme: theme
      },
      async (page, context) => {
        const prefix = `${theme}-${width}`;
        await context.addInitScript((theme) => {
          if (!localStorage.getItem('storm_archive_theme'))
            localStorage.setItem('storm_archive_theme', theme);
        }, theme);
        await page.goto(url);
        await ready(page);
        assert.equal(await page.locator('.pwa-install-banner').count(), 0);
        assert.equal(
          await page.locator('.page-heading .pwa-status-ready').count(),
          1
        );
        assert.equal(
          await page.locator('.section-caption, .archive-total').count(),
          0
        );
        assert.match(await page.title(), /^Storm Archive/);
        await page
          .getByRole('button', {
            name: 'Storm Archive — открыть архив',
            exact: true
          })
          .waitFor();
        const manifest = await page.evaluate(() =>
          fetch('/manifest.json').then((response) => response.json())
        );
        assert.equal(manifest.name, 'Storm Archive');
        assert.equal(manifest.short_name, 'Storm Archive');
        await page.evaluate(() => document.fonts.ready);
        await screenshot(page, prefix + '-empty');
        const go = async (name) => {
          await page
            .locator(mobile ? '.mobile-bottom-nav' : '.desktop-nav')
            .getByRole('button', { name: new RegExp('^' + name) })
            .click();
        };
        await page
          .locator(mobile ? '.mobile-fab-btn' : '.add-event-btn')
          .click();
        await page
          .locator('#field-title')
          .fill('Изолированная проверка материалов');
        await page.locator('#field-date').fill('2019-08-20T10:15');
        await page.locator('#field-location').fill('Только тестовый браузер');
        const chooser = page.waitForEvent('filechooser');
        await page
          .getByRole('button', { name: 'Добавить снимки', exact: true })
          .click();
        await (await chooser).setFiles([fixture, fixture]);
        await page.waitForFunction(
          () => document.querySelectorAll('.form-photo-row').length === 2
        );
        assert.equal(
          await page.locator('#field-date').inputValue(),
          '2019-08-20T10:15'
        );
        assert.equal(
          await page.getByLabel('Широта', { exact: true }).inputValue(),
          '56.5'
        );
        await page
          .getByLabel('Подпись к снимку 1', { exact: true })
          .fill('Исходный JPEG из регрессионного набора');
        await page.locator('.classification-disclosure > summary').click();
        await page.locator('#field-category').selectOption('hail');
        await page.locator('#field-hail').waitFor();
        await page.locator('#field-category').selectOption('tornadic');
        await page.locator('#field-subtype').selectOption('tornado');
        await page
          .locator('#field-tornado-origin')
          .selectOption('non_mesocyclonic');
        assert.equal(await page.locator('#field-tornado-intensity').count(), 0);
        await page.locator('#field-tornado-origin').selectOption('unspecified');
        assert.equal(
          await page.locator('#field-tornado-intensity').inputValue(),
          'ifu'
        );
        await page.locator('#field-category').selectOption('mcs');
        await page
          .getByRole('checkbox', { name: 'Derecho', exact: true })
          .locator('..')
          .click();
        await page.locator('#field-subtype').selectOption('qlcs');
        assert(
          await page
            .getByRole('checkbox', { name: 'Derecho', exact: true })
            .isChecked()
        );
        await screenshot(page, prefix + '-classification');
        await page
          .getByRole('button', { name: 'Просмотреть снимок 1', exact: true })
          .click();
        await page.locator('.lightbox-image').evaluate((img) => img.decode());
        const nextPhoto = page.getByRole('button', {
          name: 'Следующая фотография',
          exact: true
        });
        const nextBox = await nextPhoto.boundingBox();
        const point = {
          x: nextBox.x + nextBox.width / 2,
          y: nextBox.y + nextBox.height / 2
        };
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        assert(
          await nextPhoto.evaluate(
            (button, point) =>
              button.contains(document.elementFromPoint(point.x, point.y)),
            point
          ),
          'Press feedback must not move the navigation button away from the pointer'
        );
        await page.mouse.up();
        await page.getByText('2 / 2', { exact: true }).waitFor();
        await page
          .getByRole('button', { name: 'Предыдущая фотография', exact: true })
          .click();
        await page.getByText('1 / 2', { exact: true }).waitFor();
        await screenshot(page, prefix + '-lightbox');
        await page.keyboard.press('Escape');
        await settle(page);
        await page
          .getByRole('button', { name: 'Сохранить в архив', exact: true })
          .click();
        await settle(page);
        await page
          .getByRole('button', {
            name: 'Изолированная проверка материалов',
            exact: true
          })
          .waitFor();
        const original = await stored(page);
        assert.equal(original.length, 1);
        assert.equal(original[0].classification.category, 'mcs');
        assert.equal(original[0].classification.subtype, 'qlcs');
        assert(
          original[0].classification.attributes.structuralFeatures.includes(
            'derecho'
          )
        );
        await page
          .getByRole('button', { name: 'Настройки', exact: true })
          .click();
        await page.getByRole('radio', { name: /^Как на устройстве/ }).check();
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === 'dark'
        );
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === 'light'
        );
        await page
          .getByRole('radio', {
            name: theme === 'dark' ? /^Тёмная/ : /^Светлая/
          })
          .check();
        await screenshot(page, prefix + '-settings');
        await page.keyboard.press('Escape');
        await settle(page);
        await context.setOffline(true);
        await page.reload();
        await page
          .getByRole('button', {
            name: 'Изолированная проверка материалов',
            exact: true
          })
          .waitFor();
        assert.equal(
          await page.locator('html').getAttribute('data-theme'),
          theme
        );
        assert.deepEqual(await stored(page), original);
        await screenshot(page, prefix + '-archive-offline');
        await go('Галерея');
        await page.locator('.gallery-card').first().waitFor();
        assert.equal(await page.locator('.gallery-card').count(), 2);
        await screenshot(page, prefix + '-gallery');
        await go('Статистика');
        await page.locator('.month-chart').waitFor();
        const months = await page
          .locator('.month-column')
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              count: Number(node.querySelector('.month-count').textContent),
              height: node
                .querySelector('.month-bar-fill')
                .getBoundingClientRect().height,
              background: getComputedStyle(
                node.querySelector('.month-bar-track')
              ).backgroundColor
            }))
          );
        assert.equal(months.length, 12);
        for (const month of months) {
          if (month.count === 0) {
            assert.equal(month.height, 0, 'A zero month has no bar');
            assert.equal(
              month.background,
              'rgba(0, 0, 0, 0)',
              'An empty track must not resemble a full bar'
            );
          } else assert(month.height > 0);
        }
        await screenshot(page, prefix + '-stats');
        await go('Карта');
        const markerShape = await page
          .locator('.leaflet-marker-icon')
          .evaluate((marker) => {
            const pin = marker.querySelector('.pin-inner');
            return {
              display: getComputedStyle(marker).display,
              width: pin.getBoundingClientRect().width,
              height: pin.getBoundingClientRect().height
            };
          });
        assert.equal(
          markerShape.display,
          'grid',
          'Lazy Leaflet styles must not replace marker centering'
        );
        assert.equal(markerShape.width, 16);
        assert.equal(markerShape.height, 16);
        await page.locator('.map-tiles-notice').waitFor();
        if (mobile) {
          const dock = await page.locator('.mobile-dock').boundingBox();
          const zoom = await page
            .locator('.leaflet-control-zoom')
            .boundingBox();
          assert(
            zoom.y + zoom.height <= dock.y,
            'Offline notices must not push map controls behind phone navigation'
          );
        }
        const mapSkin = await page
          .locator('.leaflet-map-element')
          .evaluate((el) => {
            const zoom = el.querySelector('.leaflet-control-zoom-in');
            return {
              background: getComputedStyle(el).backgroundColor,
              zoomBackground: getComputedStyle(zoom).backgroundColor,
              // Translated entrance frames can add floating-point noise to rects.
              zoomWidth: zoom.offsetWidth,
              zoomHeight: zoom.offsetHeight
            };
          });
        assert.equal(
          mapSkin.background,
          theme === 'dark' ? 'rgb(37, 41, 43)' : 'rgb(232, 235, 230)'
        );
        assert.equal(
          mapSkin.zoomBackground,
          theme === 'dark' ? 'rgb(27, 29, 31)' : 'rgb(255, 255, 255)'
        );
        assert(
          mapSkin.zoomWidth >= 44 && mapSkin.zoomHeight >= 44,
          JSON.stringify(mapSkin)
        );
        await page.locator('.leaflet-marker-icon').click();
        assert.equal(
          await page
            .locator('.leaflet-popup-content-wrapper')
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          theme === 'dark' ? 'rgb(27, 29, 31)' : 'rgb(255, 255, 255)'
        );
        const popup = page.locator('.map-popup-btn');
        await popup.focus();
        await popup.click();
        await page
          .getByRole('dialog', {
            name: 'Изолированная проверка материалов',
            exact: true
          })
          .waitFor();
        await screenshot(page, prefix + '-detail');
        const bounds = await page.locator('.leaflet-map-element').boundingBox();
        const exit = await page.evaluate(async (bounds) => {
          document.querySelector('.detail-modal .close-btn').click();
          await Promise.resolve();
          const hit = document.elementFromPoint(
            Math.min(innerWidth - 20, bounds.x + 12),
            Math.min(innerHeight - 20, bounds.y + bounds.height - 30)
          );
          const closing = Boolean(
            document.querySelector('[data-state="closing"]')
          );
          hit.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true })
          );
          return {
            closing,
            shield: hit.classList.contains('layer-exit-shield')
          };
        }, bounds);
        assert.deepEqual(exit, { closing: true, shield: true });
        await settle(page);
        assert.equal(
          await popup.count(),
          1,
          'Exit does not click through into the map'
        );
        assert(await popup.evaluate((el) => el === document.activeElement));
        await screenshot(page, prefix + '-map');
        await page
          .getByRole('button', {
            name: 'Данные и резервные копии',
            exact: true
          })
          .click();
        const diagnostics = page.locator('.storage-diagnostics');
        assert.equal(await diagnostics.getAttribute('open'), null);
        assert.equal(
          await page
            .getByRole('button', { name: 'Проверить хранилища', exact: true })
            .count(),
          0
        );
        await diagnostics.locator('summary').focus();
        await page.keyboard.press('Space');
        await page
          .getByRole('button', { name: 'Проверить хранилища', exact: true })
          .waitFor();
        await diagnostics.locator('summary').click();
        const downloaded = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Экспорт', exact: true })
          .click();
        const backup = JSON.parse(
          await readFile(await (await downloaded).path(), 'utf8')
        );
        assert.deepEqual(backup.events, original);
        const input = page.locator('.backup-modal input[type=file]');
        await input.setInputFiles({
          name: 'invalid.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{')
        });
        await page.locator('.backup-modal .inline-alert.danger').waitFor();
        assert.deepEqual(await stored(page), original);
        const replacement = {
          ...original[0],
          title: 'Изолированная замена после подтверждения'
        };
        const file = {
          name: 'conflict.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            JSON.stringify({ ...backup, events: [replacement] })
          )
        };
        await input.setInputFiles(file);
        const confirmation = page.getByRole('dialog', {
          name: 'Заменить существующие наблюдения?',
          exact: true
        });
        await confirmation.waitFor();
        await screenshot(page, prefix + '-confirmation');
        await confirmation
          .getByRole('button', { name: 'Отмена', exact: true })
          .click();
        await settle(page);
        assert.deepEqual(await stored(page), original);
        await input.setInputFiles(file);
        await confirmation
          .getByRole('button', {
            name: 'Заменить и импортировать',
            exact: true
          })
          .click();
        await page
          .getByText('Импортировано наблюдений: 1.', { exact: true })
          .waitFor();
        await settle(page);
        assert.deepEqual(await stored(page), [replacement]);
        await screenshot(page, prefix + '-backup');
        await page.keyboard.press('Escape');
        await settle(page);
        await go('Архив');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        );
        assert.equal(overflow, false);
      }
    );
  }

  await scenario(
    'cross-window appearance synchronization',
    {},
    async (page, context) => {
      await page.goto(url);
      await ready(page);
      const second = await context.newPage();
      await second.goto(url);
      await ready(second);
      await page
        .getByRole('button', { name: 'Настройки', exact: true })
        .click();
      await page.getByRole('radio', { name: /^Тёмная/ }).check();
      await second.waitForFunction(
        () => document.documentElement.dataset.theme === 'dark'
      );
      assert.deepEqual(await stored(second), []);
    }
  );
  await scenario(
    'reduced motion and keyboard return',
    {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce'
    },
    async (page) => {
      await page.goto(url);
      await ready(page);
      assert.equal(
        await page
          .locator('.section-view')
          .evaluate((el) => getComputedStyle(el).animationName),
        'none'
      );
      const add = page.locator('.mobile-fab-btn');
      await add.focus();
      await add.click();
      assert.equal(
        await page
          .locator('.modal-card')
          .evaluate((el) => getComputedStyle(el).animationName),
        'none'
      );
      await page.keyboard.press('Escape');
      await settle(page);
      assert(await add.evaluate((el) => el === document.activeElement));
    }
  );
  await scenario(
    'appearance works when preference storage is unavailable',
    {},
    async (page, context) => {
      await context.addInitScript(() => {
        const get = Storage.prototype.getItem,
          set = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (key === 'storm_archive_theme')
            throw new Error('Unavailable preference');
          return get.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === 'storm_archive_theme')
            throw new Error('Unavailable preference');
          return set.call(this, key, value);
        };
      });
      await page.goto(url);
      await ready(page);
      await page
        .getByRole('button', { name: 'Настройки', exact: true })
        .click();
      await page.getByRole('radio', { name: /^Тёмная/ }).check();
      await page.getByText(/Не удалось сохранить выбор/).waitFor();
      assert.equal(
        await page.locator('html').getAttribute('data-theme'),
        'dark'
      );
      assert.deepEqual(await stored(page), []);
    }
  );
  await scenario(
    'theme is applied before React loads',
    {},
    async (page, context) => {
      await context.addInitScript(() =>
        localStorage.setItem('storm_archive_theme', 'dark')
      );
      await page.route('**/assets/index-*.js', (route) => route.abort());
      await page.goto(url);
      assert.equal(
        await page.locator('html').getAttribute('data-theme'),
        'dark'
      );
      assert.equal(
        await page.locator('meta[name=theme-color]').getAttribute('content'),
        '#101112'
      );
      assert.equal(
        await page.locator('#root').evaluate((el) => el.children.length),
        0
      );
    }
  );
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify({ passed: results.length, scenarios: results }, null, 2)
  );
  console.log(
    JSON.stringify(
      { passed: results.length, scenarios: results, output },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
