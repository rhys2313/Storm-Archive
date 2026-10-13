import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getStoredArchive, getStoredEvents, saveEvent, deleteEvent, buildArchiveExport,
  importArchiveJSON, ArchiveImportConflictError, __resetStorageForTests
} from './storage';
import * as photos from './photos';

const key = 'storm_archive_events';
const event = (id, more = {}) => ({ id, title: id, eventType: 'thunderstorm', photos: [], ...more });
const file = data => new File([typeof data === 'string' ? data : JSON.stringify(data)], 'backup.json', { type: 'application/json' });

const rawTransaction = async (mode, work) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('StormArchiveDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('events', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      work(tx.objectStore('events'), value => { result = value; });
    });
  } finally {
    db.close();
  }
};

const seed = async records => {
  if (!globalThis.indexedDB) localStorage.setItem(key, JSON.stringify(records));
  else await rawTransaction('readwrite', store => records.forEach(record => store.put(record)));
};
const readRaw = async () => {
  if (!globalThis.indexedDB) return JSON.parse(localStorage.getItem(key) || '[]');
  return rawTransaction('readonly', (store, setResult) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result);
  });
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  __resetStorageForTests();
});
afterEach(() => vi.restoreAllMocks());

describe.each(['indexeddb', 'localStorage'])('archive safety using %s', backend => {
  beforeEach(() => {
    if (backend === 'localStorage') globalThis.indexedDB = undefined;
  });

  it('opens correct observations alongside malformed MCS and preserves every original byte field', async () => {
    const damaged = event('damaged', {
      classification: { category: 'mcs', attributes: { structuralFeatures: { derecho: true } } },
      photos: [{ url: 'data:image/jpeg;base64,AAA', filename: 'original.jpg', source: 'user' }, { originalBytes: 'recover me' }]
    });
    await seed([event('a'), damaged, event('b')]);
    const before = await readRaw();
    const result = await getStoredArchive();
    expect(result.events.map(record => record.id).sort()).toEqual(['a', 'b', 'damaged']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe('damaged');
    expect(result.recordCount).toBe(3);
    expect(await readRaw()).toEqual(before);
    expect((await buildArchiveExport()).events).toEqual(before);
    await expect(saveEvent({ ...result.events.find(record => record.id === 'damaged'), title: 'edited' })).rejects.toThrow(/исходные данные|повреждённые/);
    expect(await readRaw()).toEqual(before);
  });

  it('retains unreadable records in storage and in exports', async () => {
    await seed([event('ok'), { id: 42, original: { photos: 'recoverable payload' } }]);
    const before = await readRaw();
    const result = await getStoredArchive();
    expect(result.events.map(record => record.id)).toEqual(['ok']);
    expect(result.issues[0].unreadable).toBe(true);
    expect(result.recordCount).toBe(2);
    expect((await buildArchiveExport()).events).toEqual(before);
    expect(await readRaw()).toEqual(before);
  });

  it('does not rewrite legacy photos or classification while reading', async () => {
    const legacy = { id: 'legacy', eventType: 'tornado', photos: [{ url: 'data:image/jpeg;base64,AAA', originalName: 'storm.jpg' }] };
    await seed([legacy]);
    expect((await getStoredEvents())[0].classification.subtype).toBe('tornado');
    __resetStorageForTests();
    expect((await getStoredEvents())[0].photos[0].originalName).toBe('storm.jpg');
    expect(await readRaw()).toEqual([legacy]);
  });

  it('saving another event preserves unreadable rows and unknown metadata', async () => {
    await seed([event('existing', { custom: { source: 'keep' } }), { id: 42, photos: { bytes: 'keep' } }]);
    await saveEvent(event('new'));
    await saveEvent(event('existing', { title: 'edited' }));
    const records = await readRaw();
    expect(records.find(record => record.id === 42)).toEqual({ id: 42, photos: { bytes: 'keep' } });
    expect(records.find(record => record.id === 'existing').custom).toEqual({ source: 'keep' });
  });

  it('rejects invalid JSON without touching existing photos', async () => {
    await seed([event('existing', { photos: [{ url: 'data:image/jpeg;base64,AAA' }] })]);
    const before = await readRaw();
    await expect(importArchiveJSON(file('{broken'))).rejects.toThrow(/JSON/);
    expect(await readRaw()).toEqual(before);
  });

  it('prevalidates the entire file before replacing or adding any records', async () => {
    await seed([event('existing', { photos: [{ url: 'data:image/jpeg;base64,KEEP' }] })]);
    const before = await readRaw();
    const incoming = [event('existing', { photos: [] }), event('new'), event('bad', {
      classification: { category: 'mcs', attributes: { structuralFeatures: 17 } }
    })];
    await expect(importArchiveJSON(file({ events: incoming }), { replaceExisting: true })).rejects.toThrow(/Архив не изменён/);
    expect(await readRaw()).toEqual(before);
  });

  it('rejects a damaged photo instead of dropping its contents during import', async () => {
    await seed([event('existing')]);
    const before = await readRaw();
    await expect(importArchiveJSON(file([event('first'), event('bad', { photos: [{ original: 'cannot display' }] })]))).rejects.toThrow(/Фотография/);
    expect(await readRaw()).toEqual(before);
  });

  it('rejects duplicate identifiers within a file', async () => {
    await seed([event('existing')]);
    const before = await readRaw();
    await expect(importArchiveJSON(file([event('same'), event('same', { title: 'different' })]))).rejects.toThrow(/Повторяющийся/);
    expect(await readRaw()).toEqual(before);
  });

  it('does not overwrite a conflicting event without explicit confirmation', async () => {
    await seed([event('existing', { photos: [{ url: 'data:image/jpeg;base64,KEEP' }] })]);
    const before = await readRaw();
    await expect(importArchiveJSON(file([event('existing'), event('new')]))).rejects.toBeInstanceOf(ArchiveImportConflictError);
    expect(await readRaw()).toEqual(before);
  });

  it('imports confirmed replacements and additions as one operation, preserving imported originals', async () => {
    await seed([event('existing'), event('untouched')]);
    const incoming = [event('existing', { title: 'confirmed', photos: [{ url: 'data:image/jpeg;base64,AAA', originalName: 'original.jpg' }] }), { id: 'legacy', eventType: 'tornado' }];
    let conflicts;
    try { await importArchiveJSON(file(incoming)); } catch (err) { conflicts = err.conflicts; }
    const result = await importArchiveJSON(file(incoming), { replaceExisting: true, expectedConflicts: conflicts });
    expect(result).toEqual({ imported: 2, skipped: 0, total: 2 });
    const records = await readRaw();
    expect(records.find(record => record.id === 'existing')).toEqual(incoming[0]);
    expect(records.find(record => record.id === 'legacy')).toEqual(incoming[1]);
    expect(records.find(record => record.id === 'untouched')).toEqual(event('untouched'));
    expect((await getStoredEvents()).find(record => record.id === 'legacy').classification.subtype).toBe('tornado');
  });

  it('does not replace data changed after the user was asked to confirm', async () => {
    await seed([event('existing')]);
    const incoming = file([event('existing', { title: 'imported' }), event('new')]);
    let conflicts;
    try { await importArchiveJSON(incoming); } catch (err) { conflicts = err.conflicts; }
    await saveEvent(event('existing', { title: 'changed in another tab' }));
    const before = await readRaw();
    await expect(importArchiveJSON(incoming, { replaceExisting: true, expectedConflicts: conflicts })).rejects.toThrow(/Архив изменился/);
    expect(await readRaw()).toEqual(before);
  });

  it('accepts an identical backup regardless of object property order without confirmation', async () => {
    await seed([event('same', { custom: { a: 1, b: 2 } })]);
    const reordered = { custom: { b: 2, a: 1 }, photos: [], eventType: 'thunderstorm', title: 'same', id: 'same' };
    await expect(importArchiveJSON(file([reordered]))).resolves.toEqual({ imported: 1, skipped: 0, total: 1 });
    expect(await getStoredEvents()).toHaveLength(1);
  });

  it('rejects unsupported or incomplete backup envelopes before any writes', async () => {
    await seed([event('existing')]);
    const before = await readRaw();
    for (const data of [
      { events: [event('new')], version: '2.0' },
      { events: [event('new')], eventCount: 2 },
      { events: [event('new')], app: 'another app' },
      { events: [event('new', { attachmentRefs: [{ id: 'blob-missing' }] })] },
      { events: [event('new')], recovery: { localStorageRaw: 'unparsed' } }
    ]) await expect(importArchiveJSON(file(data))).rejects.toThrow();
    expect(await readRaw()).toEqual(before);
  });

  it('round trips a version 1.0 backup with photos and extra metadata', async () => {
    const records = [event('legacy', { eventType: 'halo', photos: [{ url: 'data:image/jpeg;base64,AAA', caption: 'caption', exif: { camera: 'camera' }, source: 'user' }], custom: { data: true } })];
    await expect(importArchiveJSON(file({ app: 'Storm Archive', version: '1.0', events: records }))).resolves.toEqual({ imported: 1, skipped: 0, total: 1 });
    const exported = await buildArchiveExport();
    expect(exported.events).toEqual(records);
    expect((await getStoredEvents())[0].classification.category).toBe('optical');
  });
});

describe('atomic write failures', () => {
  it('rolls back earlier puts when a later IndexedDB request fails asynchronously', async () => {
    await seed([event('existing')]);
    const before = await readRaw();
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(record) {
      if (record.id === 'second') return this.add(event('existing')); // asynchronous ConstraintError
      return originalPut.call(this, record);
    });
    await expect(importArchiveJSON(file([event('first'), event('second')]))).rejects.toThrow(/Импорт не применён/);
    expect(await readRaw()).toEqual(before);
  });

  it('rolls back the batch on a quota error without resizing photos', async () => {
    await seed([event('existing')]);
    const before = await readRaw();
    const resize = vi.spyOn(photos, 'resizeDataUrl');
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(record) {
      if (record.id === 'second') throw new DOMException('full', 'QuotaExceededError');
      return originalPut.call(this, record);
    });
    await expect(importArchiveJSON(file([event('first', { photos: [{ url: 'data:image/jpeg;base64,AAA' }] }), event('second')]))).rejects.toThrow(/Архив не изменён/);
    expect(await readRaw()).toEqual(before);
    expect(resize).not.toHaveBeenCalled();
  });

  it('leaves localStorage byte-for-byte intact when the one batch write fails', async () => {
    globalThis.indexedDB = undefined;
    await seed([event('existing')]);
    const before = localStorage.getItem(key);
    const resize = vi.spyOn(photos, 'resizeDataUrl');
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await expect(importArchiveJSON(file([event('first'), event('second')]))).rejects.toThrow(/Архив не изменён/);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBe(before);
    expect(resize).not.toHaveBeenCalled();
  });

  it('does not turn a database read error into an empty archive', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => { throw new Error('read failed'); });
    await expect(getStoredArchive()).rejects.toThrow(/Не удалось прочитать архив/);
  });
});

describe('unparseable local archive recovery', () => {
  it('preserves unrelated malformed rows when a readable event is explicitly deleted', async () => {
    globalThis.indexedDB = undefined;
    const damaged = [null, false, { id: 42, photos: { original: 'keep' } }];
    await seed([event('remove'), ...damaged]);
    await deleteEvent('remove');
    expect(await readRaw()).toEqual(damaged);
  });

  it('quarantines duplicate identities and blocks ambiguous edits, deletes and replacements', async () => {
    globalThis.indexedDB = undefined;
    const records = [event('same', { title: 'first' }), event('same', { title: 'second' })];
    await seed(records);
    const original = localStorage.getItem(key);
    const result = await getStoredArchive();
    expect(result.events).toHaveLength(1);
    expect(result.issues[0].id).toBe('same');
    expect(result.issues[0].unreadable).toBe(true);
    await expect(saveEvent(event('same'))).rejects.toThrow(/повторяется/);
    await expect(deleteEvent('same')).rejects.toThrow(/повторяется/);
    await expect(importArchiveJSON(file([event('same')]), { replaceExisting: true })).rejects.toThrow(/повторяется/);
    expect(localStorage.getItem(key)).toBe(original);
    expect((await buildArchiveExport()).events).toEqual(records);
  });

  it.each(['{broken', '{"unexpected":{"photos":"keep"}}', 'null'])('exports and protects the original local text: %s', async text => {
    globalThis.indexedDB = undefined;
    localStorage.setItem(key, text);
    const archive = await getStoredArchive();
    expect(archive.events).toEqual([]);
    expect(archive.issues).toHaveLength(1);
    expect(archive.hasStoredData).toBe(true);
    expect(archive.recordCount).toBeNull();
    expect((await buildArchiveExport()).recovery.localStorageRaw).toBe(text);
    await expect(saveEvent(event('new'))).rejects.toThrow(/Изменения не применены/);
    await expect(importArchiveJSON(file([event('new')]))).rejects.toThrow(/не применены/);
    expect(localStorage.getItem(key)).toBe(text);
  });
});
