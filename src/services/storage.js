import { normalizeEventRecord, normalizeEventList } from './events';
import { resizeDataUrl } from './photos';

const DB_NAME = 'StormArchiveDB';
const DB_VERSION = 1;
const STORE_NAME = 'events';
const LOCAL_STORAGE_KEY = 'storm_archive_events';

/* ------------------------------------------------------------- backend */

/**
 * Storage backend selection.
 *
 * The backend is chosen once per session and then reused. Silently switching
 * backends mid-session would split the archive between IndexedDB and
 * localStorage and make records disappear from the UI, so a write failure is
 * reported to the user instead of triggering a fallback.
 */
let backendPromise = null;

const openIndexedDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    // Private browsing modes and some Android WebViews expose indexedDB but
    // never settle the request. Without a timeout the app would hang on the
    // loading screen forever.
    const timeout = setTimeout(() => reject(new Error('IndexedDB open timed out')), 8000);
    const settle = (fn) => (arg) => {
      clearTimeout(timeout);
      fn(arg);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = settle(() => {
      const db = request.result;
      // Another tab upgrading the schema must not leave this tab with a stale
      // connection that blocks it.
      db.onversionchange = () => {
        db.close();
        backendPromise = null;
      };
      resolve(db);
    });
    request.onerror = settle(() => reject(request.error || new Error('IndexedDB open failed')));
    request.onblocked = settle(() => reject(new Error('IndexedDB open blocked by another tab')));
  });

const getBackend = () => {
  if (!backendPromise) {
    backendPromise = openIndexedDb()
      .then(db => ({ kind: 'idb', db }))
      .catch(err => {
        console.warn('IndexedDB unavailable, using localStorage instead:', err);
        return { kind: 'local' };
      });
  }
  return backendPromise;
};

/** Exposed for diagnostics and for the backup dialog's storage notice. */
export const getStorageBackend = async () => (await getBackend()).kind;

/* --------------------------------------------------------- idb helpers */

const runTransaction = (db, mode, work) =>
  new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE_NAME, mode);
    } catch (err) {
      reject(err);
      return;
    }
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Ошибка транзакции IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('Транзакция IndexedDB прервана'));
    try {
      result = work(tx.objectStore(STORE_NAME), tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already aborting */ }
      reject(err);
    }
  });

const getAllRecords = (db) =>
  new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE_NAME, 'readonly');
    } catch (err) {
      reject(err);
      return;
    }
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Ошибка чтения из IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('Чтение из IndexedDB прервано'));
  });

/* ------------------------------------------------------- local helpers */

const readLocal = () => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Corrupt JSON must not brick the app; the raw value is kept aside so the
    // data is still recoverable by hand.
    console.error('Local archive is corrupt and was ignored:', err);
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) localStorage.setItem(`${LOCAL_STORAGE_KEY}_corrupt_backup`, raw);
    } catch { /* nothing else we can do */ }
    return [];
  }
};

const writeLocal = (events) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
};

/* ---------------------------------------------------------------- read */

export const getStoredEvents = async () => {
  const backend = await getBackend();

  let raw = [];
  if (backend.kind === 'idb') {
    try {
      raw = await getAllRecords(backend.db);
    } catch (err) {
      console.error('Failed to read events from IndexedDB:', err);
      throw new Error('Не удалось прочитать архив из локальной базы данных.');
    }
  } else {
    raw = readLocal();
  }

  const events = normalizeEventList(raw);

  // Records written by older versions are upgraded in place so the migration
  // runs once rather than on every load.
  const needsRewrite = events.filter((event, index) => JSON.stringify(event) !== JSON.stringify(raw[index]));
  if (needsRewrite.length) {
    try {
      if (backend.kind === 'idb') {
        await runTransaction(backend.db, 'readwrite', store => {
          needsRewrite.forEach(event => store.put(event));
        });
      } else {
        writeLocal(events);
      }
    } catch (err) {
      console.warn('Could not persist normalized records:', err);
    }
  }

  return events;
};

/* --------------------------------------------------------------- write */

const isQuotaError = (err) =>
  Boolean(err) && (
    err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22
    || /quota|storage is full|exceeded/i.test(err.message || '')
  );

// Progressively smaller re-encodings, tried in order when a write is rejected
// for lack of space. `null` means "store the photos as they are".
const SHRINK_STEPS = [
  null,
  { side: 1024, quality: 0.7 },
  { side: 720, quality: 0.6 },
  { side: 480, quality: 0.5 }
];

const shrinkPhotos = async (event, step) => {
  if (!step || !Array.isArray(event.photos) || event.photos.length === 0) return event;
  const photos = await Promise.all(
    event.photos.map(async photo => ({
      ...photo,
      url: await resizeDataUrl(photo.url, step.side, step.quality)
    }))
  );
  return { ...event, photos };
};

const QUOTA_MESSAGE = 'В локальном хранилище не хватает места даже для сжатых фотографий. '
  + 'Сделайте резервную копию и удалите часть старых записей с фото.';

/**
 * Persists one event, shrinking its photos if the storage quota is hit.
 * Returns the record as it was actually stored, so the caller can refresh the
 * UI with the possibly downscaled photos.
 */
const persistEvent = async (backend, event) => {
  let lastError = null;

  for (const step of SHRINK_STEPS) {
    const payload = await shrinkPhotos(event, step);
    try {
      if (backend.kind === 'idb') {
        await runTransaction(backend.db, 'readwrite', store => { store.put(payload); });
      } else {
        const events = readLocal();
        const index = events.findIndex(item => item && item.id === payload.id);
        if (index >= 0) events[index] = payload;
        else events.push(payload);
        writeLocal(events);
      }
      return payload;
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) throw err;
    }
  }

  console.error('Save failed after shrinking photos:', lastError);
  throw new Error(QUOTA_MESSAGE);
};

export const saveEvent = async (eventData) => {
  const now = new Date().toISOString();
  const record = normalizeEventRecord({
    ...eventData,
    createdAt: eventData?.createdAt || now,
    updatedAt: now
  });

  if (!record) throw new Error('Запись не содержит обязательных полей и не была сохранена.');

  const backend = await getBackend();
  return persistEvent(backend, record);
};

export const deleteEvent = async (id) => {
  if (!id) throw new Error('Не указан идентификатор записи для удаления.');
  const backend = await getBackend();

  if (backend.kind === 'idb') {
    await runTransaction(backend.db, 'readwrite', store => { store.delete(id); });
  } else {
    writeLocal(readLocal().filter(event => event && event.id !== id));
  }
  return id;
};

export const clearAllEvents = async () => {
  const backend = await getBackend();

  if (backend.kind === 'idb') {
    await runTransaction(backend.db, 'readwrite', store => { store.clear(); });
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
  return true;
};

/* ------------------------------------------------------ backup / restore */

export const buildArchiveExport = async () => {
  const events = await getStoredEvents();
  return {
    app: 'Storm Archive',
    version: '1.1',
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events
  };
};

export const exportArchiveJSON = async () => {
  const payload = await buildArchiveExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `storm_archive_backup_${new Date().toISOString().slice(0, 10)}.json`;
  link.rel = 'noopener';
  // The anchor must be in the document for the download to start in Firefox,
  // and the object URL must outlive the click for Safari and Android WebView.
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return payload.eventCount;
};

const MAX_IMPORT_BYTES = 300 * 1024 * 1024;

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Ошибка чтения файла резервной копии'));
    reader.readAsText(file);
  });

/**
 * Restores a backup, merging it into the current archive.
 * Records already present are overwritten by the imported version; invalid
 * records are skipped and reported instead of aborting the whole import.
 */
export const importArchiveJSON = async (file) => {
  if (!file) throw new Error('Файл резервной копии не выбран');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Файл резервной копии слишком большой');

  const text = await readFileAsText(file);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или не является JSON');
  }

  // Accepts both the wrapped export format and a bare array of events.
  const rawEvents = Array.isArray(data) ? data : data?.events;
  if (!Array.isArray(rawEvents)) throw new Error('Некорректный формат файла резервной копии');

  const backend = await getBackend();
  let imported = 0;
  let skipped = 0;

  for (const raw of rawEvents) {
    const record = normalizeEventRecord(raw);
    if (!record) {
      skipped += 1;
      continue;
    }
    try {
      await persistEvent(backend, record);
      imported += 1;
    } catch (err) {
      if (isQuotaError(err) || err.message === QUOTA_MESSAGE) {
        throw new Error(`${QUOTA_MESSAGE} Импортировано записей до остановки: ${imported}.`);
      }
      console.warn('Skipped an event during import:', err);
      skipped += 1;
    }
  }

  if (imported === 0 && skipped > 0) {
    throw new Error('В файле не найдено ни одной корректной записи');
  }

  return { imported, skipped, total: rawEvents.length };
};

/** Test seam: forces the backend to be re-selected on the next call. */
export const __resetStorageForTests = () => {
  backendPromise = null;
};
