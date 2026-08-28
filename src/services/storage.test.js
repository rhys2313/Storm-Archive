import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
  getStoredEvents,
  saveEvent,
  deleteEvent,
  clearAllEvents,
  buildArchiveExport,
  importArchiveJSON,
  getStorageBackend,
  __resetStorageForTests
} from './storage';

/** Wipes both backends and forces backend re-selection, as on a cold start. */
const resetStorage = () => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  __resetStorageForTests();
};

const photo = (id, size = 32) => ({
  id,
  url: `data:image/jpeg;base64,${'A'.repeat(size)}`,
  thumb: `data:image/jpeg;base64,${'B'.repeat(8)}`,
  caption: `Кадр ${id}`,
  exif: { camera: 'Canon EOS R6' }
});

const draft = (overrides = {}) => ({
  id: 'evt_1',
  title: 'Гроза над городом',
  date: '2024-06-15T18:30',
  eventType: 'thunderstorm',
  classification: { category: 'thunderstorm', subtype: 'multicell', attributes: {} },
  severity: 'severe',
  location: 'г. Бор',
  latitude: 56.35,
  longitude: 44.07,
  notes: 'Частые разряды',
  tags: ['гроза'],
  photos: [],
  ...overrides
});

const asFile = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return new File([text], 'backup.json', { type: 'application/json' });
};

beforeEach(resetStorage);
afterEach(() => vi.restoreAllMocks());

describe('backend selection', () => {
  it('uses IndexedDB when it is available', async () => {
    expect(await getStorageBackend()).toBe('idb');
  });

  it('falls back to localStorage when IndexedDB is missing', async () => {
    globalThis.indexedDB = undefined;
    __resetStorageForTests();
    expect(await getStorageBackend()).toBe('local');

    await saveEvent(draft());
    expect(await getStoredEvents()).toHaveLength(1);
    expect(localStorage.getItem('storm_archive_events')).toContain('Гроза над городом');
  });

  it('falls back when opening the database throws', async () => {
    globalThis.indexedDB = { open: () => { throw new Error('blocked by policy'); } };
    __resetStorageForTests();
    expect(await getStorageBackend()).toBe('local');
    await saveEvent(draft());
    expect(await getStoredEvents()).toHaveLength(1);
  });
});

describe('observation lifecycle', () => {
  it('starts from an empty archive', async () => {
    expect(await getStoredEvents()).toEqual([]);
  });

  it('creates, reads, updates and deletes a record', async () => {
    await saveEvent(draft());

    let stored = await getStoredEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Гроза над городом');
    expect(stored[0].createdAt).toBeTruthy();

    await saveEvent({ ...stored[0], title: 'Гроза над городом (уточнено)', severity: 'extreme' });
    stored = await getStoredEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Гроза над городом (уточнено)');
    expect(stored[0].severity).toBe('extreme');

    await deleteEvent(stored[0].id);
    expect(await getStoredEvents()).toEqual([]);
  });

  it('preserves createdAt and advances updatedAt on edit', async () => {
    const created = await saveEvent(draft());
    await new Promise(resolve => setTimeout(resolve, 5));
    const edited = await saveEvent({ ...created, title: 'Изменено' });

    expect(edited.createdAt).toBe(created.createdAt);
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
  });

  it('survives a restart: data is re-read from the database, not from memory', async () => {
    await saveEvent(draft({ photos: [photo('p1'), photo('p2')] }));

    // Simulates closing and reopening the app: new connection, same database.
    __resetStorageForTests();

    const stored = await getStoredEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0].photos).toHaveLength(2);
    expect(stored[0].photos[0].url).toContain('data:image/jpeg;base64,');
    expect(stored[0].photos[0].caption).toBe('Кадр p1');
    expect(stored[0].photos[0].exif.camera).toBe('Canon EOS R6');
  });

  it('keeps several observations independent', async () => {
    await saveEvent(draft({ id: 'evt_1', photos: [photo('a')] }));
    await saveEvent(draft({ id: 'evt_2', title: 'Шквал', photos: [photo('b'), photo('c')] }));

    const stored = await getStoredEvents();
    const byId = Object.fromEntries(stored.map(event => [event.id, event]));
    expect(byId.evt_1.photos.map(p => p.id)).toEqual(['a']);
    expect(byId.evt_2.photos.map(p => p.id)).toEqual(['b', 'c']);

    await deleteEvent('evt_1');
    const remaining = await getStoredEvents();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('evt_2');
    expect(remaining[0].photos).toHaveLength(2);
  });

  it('removes photos together with their observation', async () => {
    await saveEvent(draft({ photos: [photo('a'), photo('b')] }));
    await deleteEvent('evt_1');
    expect(await getStoredEvents()).toEqual([]);
  });

  it('removes a single photo from an existing record', async () => {
    const saved = await saveEvent(draft({ photos: [photo('a'), photo('b')] }));
    await saveEvent({ ...saved, photos: saved.photos.filter(p => p.id !== 'a') });

    const stored = await getStoredEvents();
    expect(stored[0].photos.map(p => p.id)).toEqual(['b']);
  });

  it('clears the whole archive', async () => {
    await saveEvent(draft({ id: 'evt_1' }));
    await saveEvent(draft({ id: 'evt_2' }));
    await clearAllEvents();
    expect(await getStoredEvents()).toEqual([]);
  });

  it('rejects a record without an id instead of writing junk', async () => {
    await expect(saveEvent({ title: 'Без id' })).rejects.toThrow(/обязательных полей/);
    expect(await getStoredEvents()).toEqual([]);
  });

  it('rejects deletion without an id', async () => {
    await expect(deleteEvent(undefined)).rejects.toThrow(/идентификатор/);
  });

  it('repairs incomplete records on save', async () => {
    const saved = await saveEvent({ id: 'evt_min' });
    expect(saved.title).toBe('Без названия');
    expect(saved.severity).toBe('moderate');
    expect(saved.photos).toEqual([]);
    expect((await getStoredEvents())[0].title).toBe('Без названия');
  });
});

describe('legacy data migration', () => {
  it('upgrades a record stored before hierarchical classification existed', async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('StormArchiveDB', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      tx.objectStore('events').put({
        id: 'legacy_1',
        title: 'Старое торнадо',
        eventType: 'tornado',
        date: '2019-05-01T15:00',
        photos: [{ url: 'data:image/jpeg;base64,AAA' }]
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    __resetStorageForTests();

    const stored = await getStoredEvents();
    expect(stored[0].classification).toEqual({ category: 'tornadic', subtype: 'tornado', attributes: { tornadoOrigin: 'unspecified', tornadoIntensity: 'ifu' } });
    expect(stored[0].photos[0].id).toBe('photo_legacy_0');
    expect(stored[0].severity).toBe('moderate');

    // The upgrade is written back, so a second load returns the same shape.
    __resetStorageForTests();
    expect((await getStoredEvents())[0].classification.category).toBe('tornadic');
  });

  it('ignores corrupt localStorage content instead of crashing', async () => {
    globalThis.indexedDB = undefined;
    localStorage.setItem('storm_archive_events', '{not json');
    __resetStorageForTests();

    expect(await getStoredEvents()).toEqual([]);
    expect(localStorage.getItem('storm_archive_events_corrupt_backup')).toBe('{not json');
  });

  it('ignores a localStorage payload that is not an array', async () => {
    globalThis.indexedDB = undefined;
    localStorage.setItem('storm_archive_events', '{"events":[]}');
    __resetStorageForTests();
    expect(await getStoredEvents()).toEqual([]);
  });
});

describe('quota handling', () => {
  it('reports a clear error when even shrunken photos do not fit', async () => {
    globalThis.indexedDB = undefined;
    __resetStorageForTests();

    const quotaError = new Error('exceeded the quota');
    quotaError.name = 'QuotaExceededError';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError; });

    await expect(saveEvent(draft({ photos: [photo('a', 2048)] }))).rejects.toThrow(/не хватает места/);
  });

  it('propagates non-quota write errors unchanged', async () => {
    globalThis.indexedDB = undefined;
    __resetStorageForTests();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk on fire'); });

    await expect(saveEvent(draft())).rejects.toThrow('disk on fire');
  });
});

describe('backup and restore', () => {
  it('exports every field needed to rebuild the archive', async () => {
    await saveEvent(draft({ photos: [photo('a')] }));
    const payload = await buildArchiveExport();

    expect(payload.app).toBe('Storm Archive');
    expect(payload.eventCount).toBe(1);
    expect(payload.events[0].photos[0].url).toContain('data:image/jpeg');
    expect(payload.events[0].classification.category).toBe('thunderstorm');
  });

  it('round-trips an export through an import', async () => {
    await saveEvent(draft({ photos: [photo('a'), photo('b')] }));
    const payload = await buildArchiveExport();

    await clearAllEvents();
    expect(await getStoredEvents()).toEqual([]);

    const result = await importArchiveJSON(asFile(payload));
    expect(result).toEqual({ imported: 1, skipped: 0, total: 1 });

    const restored = await getStoredEvents();
    expect(restored[0].title).toBe('Гроза над городом');
    expect(restored[0].photos).toHaveLength(2);
    expect(restored[0].photos[1].caption).toBe('Кадр b');
  });

  it('merges an import into existing data and overwrites by id', async () => {
    await saveEvent(draft({ id: 'evt_1', title: 'Локальная версия' }));
    const result = await importArchiveJSON(asFile({
      events: [draft({ id: 'evt_1', title: 'Версия из копии' }), draft({ id: 'evt_2', title: 'Новая' })]
    }));

    expect(result.imported).toBe(2);
    const stored = await getStoredEvents();
    expect(stored).toHaveLength(2);
    expect(stored.find(e => e.id === 'evt_1').title).toBe('Версия из копии');
  });

  it('accepts a bare array of events', async () => {
    const result = await importArchiveJSON(asFile([draft({ id: 'evt_9' })]));
    expect(result.imported).toBe(1);
  });

  it('skips invalid records but keeps the valid ones', async () => {
    const result = await importArchiveJSON(asFile({
      events: [draft({ id: 'ok_1' }), { title: 'нет id' }, null, 'строка']
    }));
    expect(result).toEqual({ imported: 1, skipped: 3, total: 4 });
    expect(await getStoredEvents()).toHaveLength(1);
  });

  it('imports records that lack a title, rather than silently dropping them', async () => {
    const result = await importArchiveJSON(asFile({ events: [{ id: 'no_title' }] }));
    expect(result.imported).toBe(1);
    expect((await getStoredEvents())[0].title).toBe('Без названия');
  });

  it('rejects malformed or unusable backup files', async () => {
    await expect(importArchiveJSON(asFile('{ broken'))).rejects.toThrow(/повреждён/);
    await expect(importArchiveJSON(asFile({ nope: true }))).rejects.toThrow(/Некорректный формат/);
    await expect(importArchiveJSON(asFile({ events: [{ noId: 1 }] }))).rejects.toThrow(/ни одной корректной записи/);
    await expect(importArchiveJSON(null)).rejects.toThrow(/не выбран/);
  });
});
