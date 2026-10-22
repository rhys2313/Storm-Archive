// Run against a local dev/preview server. Playwright is supplied by the caller;
// this regression check adds no application or development dependencies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const baseURL = process.env.STORM_TEST_URL || 'http://127.0.0.1:6418';
const address = new URL(baseURL);
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname),
  'Use a local test server'
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : {})
});
const fixture = (name) =>
  fileURLToPath(new URL(`./fixtures/${name}.jpg`, import.meta.url));
const firstDate = '2020-06-15T18:30';
const manualDate = '2019-08-20T10:15';
const results = [];
const settle = (page) =>
  page.waitForFunction(() => !document.querySelector('[data-state="closing"]'));

async function scenario(name, mobile, run) {
  // Never connect to a user's browser/profile or clear their storage.
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    timezoneId: 'Europe/Astrakhan'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Network tiles do not affect pane stacking. Keep the check deterministic
  // and avoid sending test coordinates to the public tile service.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort()
  );
  try {
    await page.goto(baseURL);
    await page.getByText('Сохраните первое наблюдение').waitFor();
    await run(page);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    results.push(name);
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}

const nav = (page, mobile) =>
  page.locator(mobile ? '.mobile-bottom-nav' : '.desktop-nav');
const activate = (locator, mobile) =>
  mobile ? locator.tap() : locator.click();
const add = (page, mobile) =>
  activate(page.locator(mobile ? '.mobile-fab-btn' : '.add-event-btn'), mobile);
const date = (page) => page.locator('#field-date');
async function upload(page, names, count) {
  await page.locator('#photo-upload-input').setInputFiles(names.map(fixture));
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('.form-photo-row').length === expected,
    count
  );
  await page.waitForFunction(
    () => !document.querySelector('#photo-upload-input').disabled
  );
}
async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('StormArchiveDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('events', 'readonly');
          const all = tx.objectStore('events').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(all.result);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      })
  );
}

async function exifFlow(page, mobile) {
  await add(page, mobile);
  await page.locator('#field-title').fill('EXIF regression');
  const defaultDate = await date(page).inputValue();
  assert(defaultDate, 'New form has a date default');
  await upload(page, ['no-exif'], 1);
  assert.equal(await date(page).inputValue(), defaultDate);
  await upload(page, ['no-exif', 'first', 'later'], 4);
  assert.equal(await date(page).inputValue(), firstDate);
  assert.equal(
    await page.getByLabel('Широта', { exact: true }).inputValue(),
    '56.5'
  );
  assert.equal(
    await page.getByLabel('Долгота', { exact: true }).inputValue(),
    '44.25'
  );
  await upload(page, ['later'], 5);
  assert.equal(
    await date(page).inputValue(),
    firstDate,
    'Second batch preserves the first EXIF date'
  );
  await date(page).fill(manualDate);
  await upload(page, ['later'], 6);
  assert.equal(await date(page).inputValue(), manualDate);
  await page
    .getByRole('button', { name: 'Сохранить в архив', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settle(page);
  const saved = (await stored(page))[0];
  assert.equal(saved.date, manualDate);
  assert.deepEqual(saved.photos[2].exif, {
    camera: 'Regression Fixture camera',
    focalLength: '50mm',
    iso: 'ISO 200',
    aperture: 'f/4',
    exposure: '1/250s'
  });
  const originalPhotos = saved.photos;
  await page.reload();
  await page
    .getByRole('heading', { name: 'EXIF regression', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click();
  await upload(page, ['first'], 7);
  assert.equal(
    await date(page).inputValue(),
    manualDate,
    'Saved date survives upload on edit'
  );
  await date(page).fill('');
  await upload(page, ['later'], 8);
  assert.equal(
    await date(page).inputValue(),
    '',
    'Manually cleared date stays empty'
  );
  await date(page).fill(firstDate);
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settle(page);
  const edited = (await stored(page))[0];
  assert.equal(edited.date, firstDate);
  assert.deepEqual(
    edited.photos.slice(0, 6),
    originalPhotos,
    'Existing photo contents stay intact'
  );
  await add(page, mobile);
  await date(page).fill('');
  await upload(page, ['first'], 1);
  assert.equal(
    await date(page).inputValue(),
    '',
    'Manual clearing before first upload is protected'
  );
  await date(page).fill(manualDate);
  await upload(page, ['later'], 2);
  assert.equal(await date(page).inputValue(), manualDate);
  await page.keyboard.press('Escape');
  await settle(page);
  await page
    .getByRole('button', { name: 'Закрыть без сохранения', exact: true })
    .click();
  assert.deepEqual(
    await stored(page),
    [edited],
    'Cancelled upload form leaves saved archive intact'
  );
}

async function mapFlow(page, mobile) {
  await activate(
    nav(page, mobile).getByRole('button', { name: 'Карта', exact: true }),
    mobile
  );
  await activate(
    page
      .locator('.map-overlay-empty')
      .getByRole('button', { name: 'Добавить наблюдение', exact: true }),
    mobile
  );
  await page.getByRole('dialog', { name: 'Новое наблюдение' }).waitFor();
  await page.keyboard.press('Escape');
  await settle(page);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settle(page);
  const photos = await Promise.all(
    ['first', 'later'].map(async (name, index) => {
      const url = `data:image/jpeg;base64,${(await readFile(fixture(name))).toString('base64')}`;
      return {
        id: `test-photo-${index}`,
        url,
        thumb: url,
        caption: `Test photo ${index + 1}`
      };
    })
  );
  const event = {
    id: 'map-regression',
    title: 'Map regression',
    date: firstDate,
    eventType: 'thunderstorm',
    severity: 'moderate',
    latitude: 56.5,
    longitude: 44.25,
    location: 'Temporary browser fixture',
    notes: 'Scroll regression. '.repeat(1000),
    tags: ['regression'],
    photos,
    createdAt: '2020-06-15T14:30:00Z'
  };
  await page.evaluate(
    (event) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('StormArchiveDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('events', 'readwrite');
          tx.objectStore('events').add(event);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    event
  );
  await page.reload();
  await activate(
    nav(page, mobile).getByRole('button', { name: /^Архив/ }),
    mobile
  );
  await page.getByRole('heading', { name: event.title, exact: true }).waitFor();
  const before = await stored(page);
  await activate(
    nav(page, mobile).getByRole('button', { name: 'Карта', exact: true }),
    mobile
  );
  const marker = page.locator('.leaflet-marker-icon');
  const open = async () => {
    await activate(marker, mobile);
    const popup = page.getByRole('button', {
      name: 'Открыть наблюдение',
      exact: true
    });
    await popup.focus();
    await activate(popup, mobile);
    await page
      .getByRole('dialog', { name: event.title, exact: true })
      .waitFor();
  };
  await open();
  const dialog = page.getByRole('dialog', { name: event.title, exact: true });
  if (process.env.STORM_SCREENSHOT_DIR) {
    await page.screenshot({
      path: join(
        process.env.STORM_SCREENSHOT_DIR,
        `map-dialog-${mobile ? 'mobile' : 'desktop'}.png`
      ),
      animations: 'disabled'
    });
  }
  assert(
    await dialog.evaluate((el) => el === document.activeElement),
    'Dialog receives focus'
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    'hidden'
  );
  const covered = await page.evaluate(() => {
    const selectors = [
      '.leaflet-marker-icon',
      '.leaflet-popup',
      '.leaflet-control-zoom',
      '.map-header-info'
    ];
    return selectors.map((selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      return { selector, covered: !!top?.closest('.modal-backdrop') };
    });
  });
  assert(
    covered.every((item) => item.covered),
    JSON.stringify(covered)
  );
  await page.keyboard.press('Shift+Tab');
  assert(
    await dialog
      .getByRole('button', { name: 'Удалить', exact: true })
      .evaluate((el) => el === document.activeElement)
  );
  await page.keyboard.press('Tab');
  assert(
    await dialog
      .getByRole('button', { name: 'Закрыть', exact: true })
      .evaluate((el) => el === document.activeElement)
  );
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    assert(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
      'Tab stays in dialog'
    );
  }
  const scroll = dialog.locator('.scrollable-body');
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  const scrollY = await page.evaluate(() => window.scrollY);
  await scroll.hover();
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(
    () => document.querySelector('.detail-modal .scrollable-body').scrollTop > 0
  );
  assert.equal(
    await page.evaluate(() => window.scrollY),
    scrollY,
    'Background stays still'
  );
  const photo = dialog.getByRole('button', {
    name: 'Открыть снимок 1 из 2',
    exact: true
  });
  await activate(photo, mobile);
  const lightbox = page.getByRole('dialog', { name: /Просмотр фотографии/ });
  await lightbox.waitFor();
  if (process.env.STORM_SCREENSHOT_DIR) {
    await page.screenshot({
      path: join(
        process.env.STORM_SCREENSHOT_DIR,
        `lightbox-${mobile ? 'mobile' : 'desktop'}.png`
      ),
      animations: 'disabled'
    });
  }
  assert(await lightbox.evaluate((el) => el === document.activeElement));
  await page.keyboard.press('ArrowRight');
  await page
    .getByRole('dialog', { name: /Просмотр фотографии 2 из 2/ })
    .waitFor();
  if (mobile) {
    const gesturePolicy = await page
      .locator('.lightbox-stage')
      .evaluate((el) => getComputedStyle(el).touchAction);
    assert(
      gesturePolicy.includes('pan-y') && gesturePolicy.includes('pinch-zoom'),
      gesturePolicy
    );
    // Let the new photo reach the compositor before sending native touch input.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 100, y: 300 }]
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 240, y: 310 }]
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await touch.detach();
    await page
      .getByRole('dialog', { name: /Просмотр фотографии 1 из 2/ })
      .waitFor();
    assert.equal(
      new URL(page.url()).hash,
      '#map',
      'Photo swipe does not navigate browser history'
    );
    assert.equal(await page.locator('.leaflet-map-element').count(), 1);
  }
  await page.keyboard.press('Escape');
  await settle(page);
  await lightbox.waitFor({ state: 'hidden' });
  await settle(page);
  assert(
    await photo.evaluate((el) => el === document.activeElement),
    'Photo opener regains focus'
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    'hidden'
  );
  await page.keyboard.press('Escape');
  await settle(page);
  await dialog.waitFor({ state: 'hidden' });
  await settle(page);
  assert(
    await page
      .locator('.map-popup-btn')
      .evaluate((el) => el === document.activeElement),
    'Popup opener regains focus'
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');

  // The popup is still open: exercise its button by keyboard this time.
  await page.keyboard.press('Enter');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await settle(page);
  await page
    .getByRole('button', { name: 'Данные и резервные копии', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Данные и резервные копии', exact: true })
    .waitFor();
  await page.keyboard.press('Escape');
  await settle(page);
  await add(page, mobile);
  await page.getByRole('dialog', { name: 'Новое наблюдение' }).waitFor();
  await page.locator('#field-title').fill('Discard test');
  await page.keyboard.press('Escape');
  await settle(page);
  const confirm = page.getByRole('dialog', { name: 'Закрыть без сохранения?' });
  await confirm.waitFor();
  await page.keyboard.press('Escape');
  await settle(page);
  await confirm.waitFor({ state: 'hidden' });
  await settle(page);
  await page.keyboard.press('Escape');
  await settle(page);
  await page
    .getByRole('button', { name: 'Закрыть без сохранения', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settle(page);

  if (!mobile) {
    await page.locator('.map-popup-btn').click();
    await dialog.waitFor();
    await page.mouse.click(3, 150);
    await dialog.waitFor({ state: 'hidden' });
    await settle(page);
  }
  for (const name of ['Галерея', 'Статистика', 'Архив', 'Карта']) {
    await activate(
      nav(page, mobile).getByRole('button', { name: new RegExp(`^${name}`) }),
      mobile
    );
  }
  await marker.click();
  await page.locator('.map-popup-btn').click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await settle(page);
  assert.deepEqual(
    await stored(page),
    before,
    'Viewing and cancelled forms never change the archive'
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true,
    'No horizontal overflow'
  );
}

try {
  for (const mobile of [false, true]) {
    const device = mobile ? 'mobile 390×844' : 'desktop 1280×900';
    await scenario(`EXIF: ${device}`, mobile, (page) => exifFlow(page, mobile));
    await scenario(`map/dialog: ${device}`, mobile, (page) =>
      mapFlow(page, mobile)
    );
  }
  console.log(
    JSON.stringify({ passed: results.length, scenarios: results }, null, 2)
  );
} finally {
  await browser.close();
}
