import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getStoredArchive, getStoredEvents, getStorageBackend, saveEvent, deleteEvent, clearAllEvents,
  buildArchiveExport, importArchiveJSON, prepareStorageMerge, mergeStorageArchives,
  keepBothStorageVersions, retryStorageConnection, __resetStorageForTests
} from './storage';

const key = 'storm_archive_events';
const event = (id, extra = {}) => ({ id, title: id, eventType: 'thunderstorm', photos: [], ...extra });
const file = events => new File([JSON.stringify({ events })], 'backup.json', { type: 'application/json' });
const local = records => localStorage.setItem(key, JSON.stringify(records));
const rawLocal = () => JSON.parse(localStorage.getItem(key) || '[]');
const open = (version) => new Promise((resolve, reject) => {
  const request = version ? indexedDB.open('StormArchiveDB', version) : indexedDB.open('StormArchiveDB');
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('events')) request.result.createObjectStore('events', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const rawDb = async (work, mode = 'readonly') => {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('events', mode);
      let result;
      work(tx.objectStore('events'), value => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
};
const seed = records => rawDb(store => records.forEach(record => store.put(record)), 'readwrite');
const read = () => rawDb((store, set) => {
  const request = store.getAll();
  request.onsuccess = () => set(request.result);
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  __resetStorageForTests();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('reading both archive backends', () => {
  it('still allows explicitly clearing an unreadable fallback archive when the primary is empty', async () => {
    localStorage.setItem(key, '{damaged original');
    expect((await getStoredArchive()).issues).toHaveLength(1);
    await clearAllEvents();
    expect(localStorage.getItem(key)).toBeNull();
    expect(await getStoredEvents()).toEqual([]);
  });
  it('keeps fallback writes visible after access returns and after repeated cold starts', async () => {
    const factory = indexedDB;
    globalThis.indexedDB = { open: () => { throw new DOMException('temporarily denied', 'SecurityError'); } };
    await saveEvent(event('fallback', { notes: 'keep', latitude: 48, longitude: 44,
      photos: [{ url: 'data:image/jpeg;base64,KEEP', caption: 'original', extra: 'metadata' }] }));
    const original = localStorage.getItem(key);
    globalThis.indexedDB = factory;
    await retryStorageConnection();
    for (let n = 0; n < 3; n += 1) {
      __resetStorageForTests();
      const archive = await getStoredArchive();
      expect(archive.events.map(record => record.id)).toEqual(['fallback']);
      expect(archive.storage.canMerge).toBe(true);
      expect(archive.events[0].photos[0].extra).toBe('metadata');
      expect(localStorage.getItem(key)).toBe(original);
      expect(await read()).toEqual([]);
    }
  });

  it('shows primary and fallback events together without migrating during reads or exports', async () => {
    await seed([event('primary')]);
    local([event('reserve')]);
    const primary = await read();
    const fallback = localStorage.getItem(key);
    const result = await getStoredArchive();
    expect(result.events.map(record => record.id).sort()).toEqual(['primary', 'reserve']);
    expect(result.recordCount).toBe(2);
    expect((await buildArchiveExport()).events).toEqual([...primary, ...rawLocal()]);
    expect(await read()).toEqual(primary);
    expect(localStorage.getItem(key)).toBe(fallback);
  });

  it('deduplicates identical cross-store records independent of property order', async () => {
    await seed([event('same', { custom: { a: 1, b: 2 } })]);
    const reserve = { custom: { b: 2, a: 1 }, title: 'same', photos: [], id: 'same', eventType: 'thunderstorm' };
    local([reserve]);
    expect((await getStoredArchive()).issues).toEqual([]);
    expect(await getStoredEvents()).toHaveLength(1);
    expect((await buildArchiveExport()).events).toHaveLength(1);
    await expect(saveEvent(event('same', { title: 'changed' }))).rejects.toThrow(/обоих хранилищах/);
    await expect(deleteEvent('same')).rejects.toThrow(/обоих хранилищах/);
    expect(rawLocal()).toEqual([reserve]);
    expect((await read())[0].title).toBe('same');
  });

  it('reports differing identities and exports both source records without selecting a winner', async () => {
    const primary = event('same', { title: 'primary', notes: 'one' });
    const reserve = event('same', { title: 'reserve', photos: [{ url: 'data:image/jpeg;base64,KEEP' }] });
    await seed([primary, event('other')]);
    local([reserve, event('local-only')]);
    const archive = await getStoredArchive();
    expect(archive.storage.conflicts).toEqual([{ id: 'same', index: 0, primary, local: reserve }]);
    expect(archive.recordCount).toBe(4);
    expect(archive.issues.some(issue => issue.id === 'same')).toBe(true);
    const exported = await buildArchiveExport();
    expect(exported.events.filter(record => record.id === 'same')).toEqual([primary, reserve]);
    expect(exported.recovery.sources).toEqual({ indexedDB: await read(), localStorage: rawLocal() });
    await expect(importArchiveJSON(file([event('same')]), { replaceExisting: true })).rejects.toThrow(/обоих хранилищах/);
    expect((await read()).find(record => record.id === 'same')).toEqual(primary);
    expect(rawLocal()[0]).toEqual(reserve);
  });

  it('edits and deletes unique fallback events at their source while IndexedDB is available', async () => {
    await seed([event('primary')]);
    local([event('reserve'), null, { id: 42, original: 'keep' }]);
    await saveEvent(event('reserve', { title: 'edited' }));
    expect(rawLocal()[0].title).toBe('edited');
    expect((await read()).map(record => record.id)).toEqual(['primary']);
    await deleteEvent('reserve');
    expect(rawLocal()).toEqual([null, { id: 42, original: 'keep' }]);
    expect((await getStoredArchive()).issues).toHaveLength(2);
  });

  it('keeps corrupted records in both stores and includes their raw fields in exports', async () => {
    const damaged = event('damaged', { classification: { category: 'mcs', attributes: { structuralFeatures: {} } } });
    await seed([event('primary'), damaged]);
    local([event('reserve'), { id: 42, originalPhoto: 'keep' }, null]);
    const before = await read();
    const fallback = localStorage.getItem(key);
    const archive = await getStoredArchive();
    expect(archive.events).toHaveLength(3);
    expect(archive.issues).toHaveLength(3);
    expect((await buildArchiveExport()).events).toEqual([...before, ...rawLocal()]);
    expect(await read()).toEqual(before);
    expect(localStorage.getItem(key)).toBe(fallback);
  });

  it('does not hide unparseable fallback data behind a healthy primary store', async () => {
    await seed([event('primary')]);
    localStorage.setItem(key, '{unparsed photos');
    const archive = await getStoredArchive();
    expect(archive.events[0].id).toBe('primary');
    expect(archive.recordCount).toBeNull();
    expect(archive.issues[0].message).toMatch(/Не удалось разобрать/);
    expect((await buildArchiveExport()).recovery.localStorageRaw).toBe('{unparsed photos');
    await expect(saveEvent(event('new'))).rejects.toThrow(/Изменения не применены/);
    expect(await read()).toEqual([event('primary')]);
  });

  it('exposes an unreadable primary store as incomplete rather than declaring an empty archive', async () => {
    local([event('reserve')]);
    const broken = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => { throw new Error('read unavailable'); });
    const archive = await getStoredArchive();
    expect(archive.events.map(record => record.id)).toEqual(['reserve']);
    expect(archive.storage.readOnly).toBe(true);
    expect(archive.storage.incomplete).toBe(true);
    await expect(saveEvent(event('new'))).rejects.toThrow(/заблокированы/);
    await expect(buildArchiveExport()).rejects.toThrow(/Полный экспорт недоступен/);
    broken.mockRestore();
    await retryStorageConnection();
    expect((await getStoredArchive()).storage.readOnly).toBe(false);
  });

  it('does not clear one backend when a whole-archive deletion spans two stores', async () => {
    await seed([event('primary')]);
    local([event('reserve')]);
    await expect(clearAllEvents()).rejects.toThrow(/двух хранилищах/);
    expect(await read()).toEqual([event('primary')]);
    expect(rawLocal()).toEqual([event('reserve')]);
  });
});

describe('schema and connection diagnostics', () => {
  it('leaves a newer schema, events and future Blob store unchanged and blocks fallback writes', async () => {
    const request = indexedDB.open('StormArchiveDB', 2);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('events', { keyPath: 'id' }).put(event('future'));
        request.result.createObjectStore('attachments', { keyPath: 'id' }).put({ id: 'blob', data: new Blob(['ORIGINAL']) });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    local([event('reserve')]);
    const original = localStorage.getItem(key);
    expect(await getStorageBackend()).toBe('incompatible');
    const archive = await getStoredArchive();
    expect(archive.storage.notices.join(' ')).toMatch(/версия 2/);
    expect(archive.storage.incomplete).toBe(true);
    expect(archive.events.map(record => record.id)).toEqual(['reserve']);
    await expect(saveEvent(event('new'))).rejects.toThrow(/Схема IndexedDB/);
    await expect(deleteEvent('reserve')).rejects.toThrow();
    await expect(importArchiveJSON(file([event('new')]))).rejects.toThrow();
    await expect(prepareStorageMerge()).rejects.toThrow();
    await expect(clearAllEvents()).rejects.toThrow();
    await expect(buildArchiveExport()).rejects.toThrow(/Полный экспорт/);
    expect(localStorage.getItem(key)).toBe(original);
    const intact = await open();
    expect(intact.version).toBe(2);
    expect([...intact.objectStoreNames]).toEqual(['attachments', 'events']);
    const tx = intact.transaction(['events', 'attachments'], 'readonly');
    const future = tx.objectStore('events').get('future');
    const blob = tx.objectStore('attachments').get('blob');
    await new Promise(resolve => { tx.oncomplete = resolve; });
    expect(future.result).toEqual(event('future'));
    expect(blob.result.id).toBe('blob');
    expect(blob.result.data).toBeTruthy();
    intact.close();
  });

  it('does not create a missing store in an existing schema or call it fallback mode', async () => {
    const request = indexedDB.open('StormArchiveDB', 1);
    const db = await new Promise(resolve => {
      request.onupgradeneeded = () => request.result.createObjectStore('other').put('keep', 'key');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    expect(await getStorageBackend()).toBe('incompatible');
    const unchanged = await open();
    expect([...unchanged.objectStoreNames]).toEqual(['other']);
    unchanged.close();
  });

  it('detects an unexpected key path without modifying the schema', async () => {
    const request = indexedDB.open('StormArchiveDB', 1);
    const db = await new Promise(resolve => {
      request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'otherId' }).put({ otherId: 'keep' });
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    expect(await getStorageBackend()).toBe('incompatible');
    await expect(saveEvent(event('new'))).rejects.toThrow();
  });

  it('times out an unsettled open request and closes its late connection', async () => {
    vi.useFakeTimers();
    const request = {};
    globalThis.indexedDB = { open: () => request };
    const backend = getStorageBackend();
    await vi.advanceTimersByTimeAsync(8001);
    expect(await backend).toBe('local');
    const close = vi.fn();
    request.result = { close };
    request.onsuccess();
    expect(close).toHaveBeenCalledOnce();
    const abort = vi.fn();
    request.transaction = { abort };
    request.onupgradeneeded({ oldVersion: 0, target: request });
    expect(abort).toHaveBeenCalledOnce();
  });

  it('reopens after a versionchange and reports the newly incompatible database', async () => {
    await saveEvent(event('old'));
    const upgraded = await open(2);
    upgraded.close();
    expect(await getStorageBackend()).toBe('incompatible');
    expect(await read()).toHaveLength(1);
  });

  it('reports an inaccessible localStorage alongside readable IndexedDB without overwriting anything', async () => {
    await seed([event('primary')]);
    const readLocal = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const archive = await getStoredArchive();
    expect(archive.events.map(record => record.id)).toEqual(['primary']);
    expect(archive.storage.readOnly).toBe(true);
    await expect(saveEvent(event('primary', { title: 'changed' }))).rejects.toThrow(/Нет доступа/);
    readLocal.mockRestore();
    expect(await read()).toEqual([event('primary')]);
  });
});

describe('verified storage consolidation', () => {
  it('retains the original when verification finds different copied contents', async () => {
    local([event('safe')]);
    const plan = await prepareStorageMerge();
    const add = IDBObjectStore.prototype.add;
    const alter = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(record) {
      return add.call(this, { ...record, title: 'incorrect copy' });
    });
    await expect(mergeStorageArchives(plan)).rejects.toThrow(/Проверка переноса/);
    alter.mockRestore();
    expect(rawLocal()).toEqual([event('safe')]);
    expect((await getStoredArchive()).storage.conflicts).toHaveLength(1);
  });
  it('copies original legacy fields exactly, verifies them, and is idempotent on restart', async () => {
    const legacy = { id: 'legacy', eventType: 'tornado', photos: [{ url: 'data:image/jpeg;base64,KEEP', extra: 'original' }] };
    await seed([event('primary'), event('same')]);
    local([legacy, event('same')]);
    const plan = await prepareStorageMerge();
    expect(plan.count).toBe(2);
    expect(rawLocal()).toEqual([legacy, event('same')]);
    expect(await mergeStorageArchives(plan)).toEqual({ copied: 2, cleaned: true });
    expect(rawLocal()).toEqual([]);
    expect((await read()).find(record => record.id === 'legacy')).toEqual(legacy);
    for (let n = 0; n < 3; n += 1) {
      __resetStorageForTests();
      expect(await getStoredEvents()).toHaveLength(3);
      expect((await prepareStorageMerge()).count).toBe(0);
    }
    await expect(mergeStorageArchives(plan)).rejects.toThrow(/изменились/);
    expect(await read()).toHaveLength(3);
  });

  it('leaves conflicting, duplicate and damaged source entries untouched while moving safe ones', async () => {
    await seed([event('conflict', { title: 'primary' })]);
    const remaining = [event('conflict', { title: 'local' }), null,
      event('damaged', { classification: false }), event('duplicate'), event('duplicate', { title: 'other' })];
    local([event('safe'), ...remaining]);
    const plan = await prepareStorageMerge();
    expect(plan).toMatchObject({ count: 1, remaining: 5 });
    await mergeStorageArchives(plan);
    expect(rawLocal()).toEqual(remaining);
    expect(await read()).toEqual([event('conflict', { title: 'primary' }), event('safe')]);
  });

  it('rolls back all copies on an asynchronous request error and supports a later retry', async () => {
    await seed([event('existing')]);
    local([event('first'), event('second')]);
    const original = localStorage.getItem(key);
    const plan = await prepareStorageMerge();
    const add = IDBObjectStore.prototype.add;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(record) {
      return add.call(this, record.id === 'second' ? event('existing') : record);
    });
    await expect(mergeStorageArchives(plan)).rejects.toThrow();
    expect(await read()).toEqual([event('existing')]);
    expect(localStorage.getItem(key)).toBe(original);
    fail.mockRestore();
    await mergeStorageArchives(await prepareStorageMerge());
    expect(await getStoredEvents()).toHaveLength(3);
    expect(rawLocal()).toEqual([]);
  });

  it('preserves originals on a quota error without shrinking any media', async () => {
    local([event('first'), event('second', { photos: [{ url: 'data:image/jpeg;base64,KEEP' }] })]);
    const original = localStorage.getItem(key);
    const plan = await prepareStorageMerge();
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(record) {
      if (record.id === 'second') throw new DOMException('full', 'QuotaExceededError');
      return add.call(this, record);
    });
    await expect(mergeStorageArchives(plan)).rejects.toThrow();
    expect(await read()).toEqual([]);
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('retains source copies when post-commit verification fails, then retries without duplicating', async () => {
    local([event('safe')]);
    const plan = await prepareStorageMerge();
    const getAll = IDBObjectStore.prototype.getAll;
    let calls = 0;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function(...args) {
      calls += 1;
      if (calls === 3) throw new Error('verification unavailable'); // initial read, transaction read, verification
      return getAll.apply(this, args);
    });
    await expect(mergeStorageArchives(plan)).rejects.toThrow();
    fail.mockRestore();
    expect(rawLocal()).toEqual([event('safe')]);
    expect(await read()).toEqual([event('safe')]);
    expect(await getStoredEvents()).toHaveLength(1);
    await mergeStorageArchives(await prepareStorageMerge());
    expect(await read()).toHaveLength(1);
    expect(rawLocal()).toEqual([]);
  });

  it('retains readable identical copies on cleanup failure and can finish cleanup later', async () => {
    local([event('safe')]);
    const plan = await prepareStorageMerge();
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(await mergeStorageArchives(plan)).toEqual({ copied: 1, cleaned: false });
    fail.mockRestore();
    __resetStorageForTests();
    expect(await getStoredEvents()).toHaveLength(1);
    expect(rawLocal()).toEqual([event('safe')]);
    await mergeStorageArchives(await prepareStorageMerge());
    expect(rawLocal()).toEqual([]);
    expect(await read()).toHaveLength(1);
  });

  it.each(['primary', 'local'])('rejects a stale confirmation when %s changes', async backend => {
    local([event('safe')]);
    const plan = await prepareStorageMerge();
    if (backend === 'primary') await seed([event('new-primary')]);
    else local([event('safe', { title: 'changed' }), event('new-local')]);
    const before = await read();
    const original = localStorage.getItem(key);
    await expect(mergeStorageArchives(plan)).rejects.toThrow(/изменил/);
    expect(await read()).toEqual(before);
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('does not prune a source changed after copying started', async () => {
    local([event('safe')]);
    const plan = await prepareStorageMerge();
    const add = IDBObjectStore.prototype.add;
    const change = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(record) {
      local([event('safe', { title: 'updated by another tab' }), event('new')]);
      return add.call(this, record);
    });
    expect(await mergeStorageArchives(plan)).toEqual({ copied: 1, cleaned: false });
    change.mockRestore();
    expect(rawLocal().map(record => record.title)).toEqual(['updated by another tab', 'new']);
    expect((await getStoredArchive()).storage.conflicts).toHaveLength(1);
  });

  it('blocks imports spanning both stores before writing, and permits the same import after merging', async () => {
    await seed([event('primary')]);
    local([event('reserve')]);
    const incoming = [event('primary', { title: 'updated' }), event('reserve', { title: 'updated reserve' }), event('new')];
    await expect(importArchiveJSON(file(incoming), { replaceExisting: true })).rejects.toThrow(/оба хранилища/);
    expect(await read()).toEqual([event('primary')]);
    expect(rawLocal()).toEqual([event('reserve')]);
    await mergeStorageArchives(await prepareStorageMerge());
    await importArchiveJSON(file(incoming), { replaceExisting: true });
    expect(await read()).toHaveLength(3);
  });

  it('applies an import touching only fallback targets as one local write', async () => {
    await seed([event('primary')]);
    local([event('reserve')]);
    await importArchiveJSON(file([event('reserve', { title: 'updated' }), event('new')]), { replaceExisting: true });
    expect(rawLocal().map(record => record.id)).toEqual(['reserve', 'new']);
    expect(await read()).toEqual([event('primary')]);
  });
});

describe('retaining conflicting versions', () => {
  it('preserves both sources when storing the separate version fails', async () => {
    await seed([event('same')]);
    local([event('same', { title: 'reserve' })]);
    const original = localStorage.getItem(key);
    const conflict = (await getStoredArchive()).storage.conflicts[0];
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await expect(keepBothStorageVersions(conflict)).rejects.toThrow();
    fail.mockRestore();
    expect(localStorage.getItem(key)).toBe(original);
    expect(await read()).toEqual([event('same')]);
    await keepBothStorageVersions(conflict);
    expect(await getStoredEvents()).toHaveLength(2);
  });

  it('supports browsers without randomUUID and preserves explicit null recovery metadata', async () => {
    await seed([event('same')]);
    local([event('same', { title: 'reserve', storageRecovery: null })]);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(undefined);
    const conflict = (await getStoredArchive()).storage.conflicts[0];
    const id = await keepBothStorageVersions(conflict);
    expect(id).toMatch(/^same__local_/);
    expect(rawLocal()[0].storageRecovery.previous).toBeNull();
    expect(await getStoredEvents()).toHaveLength(2);
  });
  it('keeps both complete versions with independent identities and supports subsequent consolidation', async () => {
    const primary = event('same', { title: 'primary', latitude: 40, longitude: 50 });
    const reserve = event('same', { title: 'reserve', notes: 'keep', photos: [{ url: 'data:image/jpeg;base64,KEEP', extra: 'source' }], storageRecovery: { oldMetadata: true } });
    await seed([primary]);
    local([reserve]);
    const conflict = (await getStoredArchive()).storage.conflicts[0];
    const id = await keepBothStorageVersions(conflict);
    expect(id).not.toBe('same');
    expect(await read()).toEqual([primary]);
    expect(rawLocal()).toEqual([{ ...reserve, id, storageRecovery: { source: 'localStorage', originalId: 'same', previous: { oldMetadata: true } } }]);
    expect((await getStoredArchive()).storage.conflicts).toEqual([]);
    expect(await getStoredEvents()).toHaveLength(2);
    await expect(keepBothStorageVersions(conflict)).rejects.toThrow(/изменились/);
    await mergeStorageArchives(await prepareStorageMerge());
    expect(await read()).toHaveLength(2);
    __resetStorageForTests();
    expect(await getStoredEvents()).toHaveLength(2);
  });

  it('rejects stale conflict decisions and leaves both sources unchanged', async () => {
    await seed([event('same')]);
    local([event('same', { title: 'local' })]);
    const conflict = (await getStoredArchive()).storage.conflicts[0];
    local([event('same', { title: 'changed since preview' })]);
    await expect(keepBothStorageVersions(conflict)).rejects.toThrow(/изменились/);
    expect(rawLocal()[0].title).toBe('changed since preview');
    expect(await read()).toEqual([event('same')]);
  });

  it('does not move or rename unsupported attachments or damaged records', async () => {
    await seed([event('same')]);
    const damaged = event('same', { attachmentRefs: [{ id: 'keep' }] });
    local([damaged]);
    const conflict = (await getStoredArchive()).storage.conflicts[0];
    expect((await prepareStorageMerge()).count).toBe(0);
    await expect(keepBothStorageVersions(conflict)).rejects.toThrow(/неподдерживаемые вложения/);
    expect(rawLocal()).toEqual([damaged]);
  });
});
