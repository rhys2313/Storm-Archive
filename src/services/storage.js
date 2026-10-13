import { normalizeEventRecord, inspectEventRecord, inspectEventList } from './events';
import { isRecordObject } from '../types/storm';
import { resizeDataUrl } from './photos';

const DB_NAME = 'StormArchiveDB';
const DB_VERSION = 1;
const STORE_NAME = 'events';
const LOCAL_STORAGE_KEY = 'storm_archive_events';

/* ------------------------------------------------------------- backend */

// Connections are cached, but archive reads always inspect both stores.
// Only an explicit retry (or a versionchange) reopens an unavailable database.
let backendPromise = null;
let operationQueue = Promise.resolve();
const withStorageLock = (work) => {
  // Web Locks also serializes writes from other tabs of this application.
  const run = () => globalThis.navigator?.locks?.request
    ? navigator.locks.request('storm-archive-storage', work) : work();
  const operation = operationQueue.then(run);
  operationQueue = operation.catch(() => {});
  return operation;
};

const openIndexedDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    let request;
    try {
      // Inspect the existing version without requesting a downgrade or upgrade.
      request = indexedDB.open(DB_NAME);
    } catch (err) {
      reject(err);
      return;
    }

    // Private browsing modes and some Android WebViews expose indexedDB but
    // never settle the request. Without a timeout the app would hang on the
    // loading screen forever.
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };
    const timeout = setTimeout(() => finish(reject, new Error('IndexedDB open timed out')), 8000);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (settled) {
        request.transaction.abort();
      } else if (event.oldVersion === 0) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      if (db.version !== DB_VERSION || !db.objectStoreNames.contains(STORE_NAME)) {
        const version = db.version;
        db.close();
        finish(resolve, { kind: 'incompatible', version });
        return;
      }
      let store;
      try { store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME); } catch (err) {
        db.close();
        finish(reject, err);
        return;
      }
      if (store.keyPath !== 'id' || store.autoIncrement) {
        db.close();
        finish(resolve, { kind: 'incompatible', version: db.version });
        return;
      }
      // Another tab upgrading the schema must not leave this tab with a stale
      // connection that blocks it.
      db.onversionchange = () => {
        db.close();
        backendPromise = null;
      };
      db.onclose = () => { backendPromise = null; };
      finish(resolve, { kind: 'idb', db });
    };
    request.onerror = () => finish(reject, request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => finish(reject, new Error('IndexedDB open blocked by another tab'));
  });

const getBackend = () => {
  if (!backendPromise) {
    backendPromise = openIndexedDb()
      .catch(err => {
        console.warn('IndexedDB unavailable, using localStorage instead:', err);
        return { kind: 'local', reason: err.message };
      });
  }
  return backendPromise;
};

/** Exposed for diagnostics and for the backup dialog's storage notice. */
export const getStorageBackend = async () => (await getBackend()).kind;

export const retryStorageConnection = () => withStorageLock(async () => {
  const previous = await backendPromise;
  previous?.db?.close();
  backendPromise = null;
  return getStorageBackend();
});

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
    let records;
    request.onsuccess = () => { records = request.result || []; };
    tx.oncomplete = () => resolve(records);
    tx.onerror = () => reject(tx.error || new Error('Ошибка чтения из IndexedDB'));
    request.onerror = () => reject(request.error || new Error('Ошибка чтения из IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('Чтение из IndexedDB прервано'));
  });

/* ------------------------------------------------------- local helpers */

const readLocalSource = () => {
  let rawText;
  try { rawText = localStorage.getItem(LOCAL_STORAGE_KEY); } catch {
    return { records: [], hasStoredData: true, unavailable: true, sourceIssue: 'Нет доступа к localStorage. Его содержимое не проверено; изменения заблокированы.' };
  }
  if (rawText == null) return { records: [], hasStoredData: false, rawText };
  try {
    const records = JSON.parse(rawText);
    if (Array.isArray(records)) return { records, hasStoredData: records.length > 0, rawText };
  } catch { /* The original text remains in its original key. */ }
  return {
    records: [], hasStoredData: true, rawText,
    sourceIssue: 'Не удалось разобрать локальный архив. Исходное содержимое сохранено; экспортируйте его для восстановления.'
  };
};

const readLocal = () => {
  const source = readLocalSource();
  if (source.sourceIssue) {
    throw new Error(`${source.sourceIssue} Изменения не применены.`);
  }
  return source.records;
};

const writeLocal = (events) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
};

/* ---------------------------------------------------------------- read */

const readArchiveSources = async () => {
  const backend = await getBackend();
  const local = readLocalSource();
  let primary = { records: [], hasStoredData: false };
  const notices = [];
  if (backend.kind === 'idb') {
    try {
      const records = await getAllRecords(backend.db);
      primary = { records, hasStoredData: records.length > 0 };
    } catch (err) {
      console.error('Failed to read events from IndexedDB:', err);
      if (!local.hasStoredData) throw new Error('Не удалось прочитать архив из локальной базы данных. Повторите проверку хранилищ.');
      primary = { records: [], hasStoredData: true, unavailable: true };
      notices.push('Не удалось прочитать IndexedDB. Показана только доступная резервная часть; изменения заблокированы.');
    }
  } else if (backend.kind === 'incompatible') {
    primary = { records: [], hasStoredData: true, unavailable: true };
    notices.push(`Схема IndexedDB (версия ${backend.version}) не поддерживается этой версией приложения (ожидается ${DB_VERSION}). База не изменена. Откройте её в совместимой версии приложения. Показаны только доступные резервные записи; изменения заблокированы.`);
  } else {
    notices.push(local.unavailable
      ? 'IndexedDB и localStorage недоступны. Содержимое архива не проверено; изменения заблокированы. Повторите проверку после восстановления доступа.'
      : 'IndexedDB временно недоступен. Показана только резервная часть в localStorage; основной архив не проверен. Новые записи сохраняются в резервном режиме. Повторите проверку после восстановления доступа.');
  }
  if (local.unavailable) notices.push(local.sourceIssue);
  return { backend, primary, local, notices };
};

const combinedRecords = ({ primary, local }) => {
  const byId = new Map(primary.records.map(record => [record?.id, record]));
  const counts = new Map();
  local.records.forEach(record => counts.set(record?.id, (counts.get(record?.id) || 0) + 1));
  // Only collapse unambiguous, byte-field-equivalent copies. Conflicts remain
  // in the raw export and are reported by inspectEventList, never overwritten.
  return [...primary.records, ...local.records.filter(record =>
    counts.get(record?.id) !== 1 || !byId.has(record?.id) || !sameRecord(record, byId.get(record.id)))];
};

const storageConflicts = ({ primary, local }) => {
  const byId = new Map(primary.records.filter(record => typeof record?.id === 'string').map(record => [record.id, record]));
  return local.records.flatMap((record, index) => byId.has(record?.id) && !sameRecord(record, byId.get(record.id))
    ? [{ id: record.id, index, primary: byId.get(record.id), local: record }]
    : []);
};

/** Read-only projection across both stores; originals are never rewritten. */
export const getStoredArchive = async () => {
  const sources = await readArchiveSources();
  const { backend, primary, local, notices } = sources;
  const records = combinedRecords(sources);
  const result = inspectEventList(records);
  if (local.sourceIssue && !local.unavailable) result.issues.push({ id: null, index: null, message: local.sourceIssue, unreadable: true });
  const primaryIds = new Set(primary.records.map(record => record?.id));
  const overlapIds = local.records.filter(record => primaryIds.has(record?.id)).map(record => record?.id);
  const conflicts = storageConflicts(sources);
  if (backend.kind === 'idb' && local.hasStoredData) notices.push('Найдены резервные данные в localStorage. Доступные записи из обоих хранилищ учтены вместе. Объединение выполняется отдельно в разделе резервных копий.');
  if (conflicts.length) notices.push(`Конфликтующих версий: ${conflicts.length}. Их содержимое различается; обе версии сохранены. Разрешите конфликты в разделе резервных копий.`);
  const incomplete = backend.kind !== 'idb' || primary.unavailable || local.unavailable;
  return {
    ...result,
    recordCount: local.sourceIssue ? null : records.length,
    hasStoredData: primary.hasStoredData || local.hasStoredData || incomplete,
    storage: { kind: backend.kind, notices, conflicts, overlapIds, incomplete: Boolean(incomplete),
      readOnly: Boolean(primary.unavailable || local.unavailable), canMerge: backend.kind === 'idb' && !primary.unavailable && local.records.length > 0 }
  };
};

export const getStoredEvents = async () => (await getStoredArchive()).events;

const writableSources = async () => {
  const sources = await readArchiveSources();
  if (sources.backend.kind === 'incompatible' || sources.primary.unavailable || sources.local.unavailable) {
    throw new Error(`${sources.notices.join(' ')} Изменения не применены.`);
  }
  if (sources.local.sourceIssue) throw new Error(`${sources.local.sourceIssue} Изменения не применены.`);
  return sources;
};

// A mutation may affect exactly one backend. Cross-store writes cannot be made
// atomic; require the explicit, verified consolidation before such an import.
const mutationBackend = (sources, ids) => {
  const localIds = new Set(sources.local.records.map(record => record?.id));
  const primaryIds = new Set(sources.primary.records.map(record => record?.id));
  if (ids.some(id => localIds.has(id) && primaryIds.has(id))) {
    throw new Error('Идентификатор есть в обоих хранилищах. Сначала объедините одинаковые копии или сохраните обе конфликтующие версии в разделе резервных копий. Изменения не применены.');
  }
  const inLocal = ids.some(id => localIds.has(id));
  if (inLocal && ids.some(id => primaryIds.has(id))) {
    throw new Error('Операция затрагивает оба хранилища. Сначала объедините их в разделе резервных копий. Изменения не применены.');
  }
  return inLocal || sources.backend.kind === 'local' ? { kind: 'local' } : sources.backend;
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

export const saveEvent = (eventData) => withStorageLock(async () => {
  if (typeof eventData?.id !== 'string' || !eventData.id.trim()) throw new Error('Запись не содержит обязательных полей и не была сохранена.');
  const sources = await writableSources();
  const backend = mutationBackend(sources, [eventData.id]);
  let existing;
  if (backend.kind === 'idb') {
    await runTransaction(backend.db, 'readonly', store => {
      const request = store.get(eventData.id);
      request.onsuccess = () => { existing = request.result; };
    });
  } else {
    const records = readLocal();
    const matches = records.filter(event => event?.id === eventData.id);
    if (matches.length > 1) throw new Error('Идентификатор записи повторяется. Экспортируйте исходный архив перед восстановлением.');
    [existing] = matches;
  }
  if (existing && inspectEventRecord(existing).issues.length) {
    throw new Error('Запись содержит повреждённые данные и сохранена без изменений. Экспортируйте исходные данные перед восстановлением.');
  }
  const now = new Date().toISOString();
  const record = normalizeEventRecord({
    ...existing,
    ...eventData,
    createdAt: eventData?.createdAt || existing?.createdAt || now,
    updatedAt: now
  });

  if (!record) throw new Error('Запись не содержит обязательных полей и не была сохранена.');
  const { issues } = inspectEventRecord({ ...existing, ...eventData });
  if (issues.length) throw new Error(`Некорректная запись: ${issues.join('; ')}. Изменения не применены.`);

  return persistEvent(backend, record);
});

export const deleteEvent = (id) => withStorageLock(async () => {
  if (!id) throw new Error('Не указан идентификатор записи для удаления.');
  const backend = mutationBackend(await writableSources(), [id]);

  if (backend.kind === 'idb') {
    await runTransaction(backend.db, 'readwrite', store => { store.delete(id); });
  } else {
    const records = readLocal();
    if (records.filter(event => event?.id === id).length > 1) throw new Error('Идентификатор повторяется. Удаление отменено; экспортируйте исходный архив перед восстановлением.');
    writeLocal(records.filter(event => event?.id !== id));
  }
  return id;
});

export const clearAllEvents = () => withStorageLock(async () => {
  const sources = await readArchiveSources();
  if (sources.backend.kind === 'incompatible' || sources.primary.unavailable || sources.local.unavailable) throw new Error('Очистка заблокирована: одно из хранилищ нельзя безопасно проверить.');
  if (sources.primary.hasStoredData && sources.local.hasStoredData) throw new Error('Архив находится в двух хранилищах. Сначала объедините данные. Очистка не применена.');
  const backend = sources.local.hasStoredData ? { kind: 'local' } : sources.backend;

  if (backend.kind === 'idb') {
    await runTransaction(backend.db, 'readwrite', store => { store.clear(); });
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
  return true;
});

/* ------------------------------------------------------ backup / restore */

export const buildArchiveExport = async () => {
  const sources = await readArchiveSources();
  const { backend, primary, local } = sources;
  if (backend.kind === 'incompatible' || primary.unavailable || local.unavailable) throw new Error('Полный экспорт недоступен: одно из хранилищ нельзя прочитать. Данные сохранены; откройте архив в совместимой версии приложения или повторите проверку.');
  const events = combinedRecords(sources);
  const conflicts = storageConflicts(sources);
  const recovery = {
    ...(local.sourceIssue ? { localStorageRaw: local.rawText } : {}),
    ...(conflicts.length ? { sources: { indexedDB: primary.records, localStorage: local.records } } : {}),
    ...(backend.kind === 'local' ? { indexedDBUnavailable: true } : {})
  };
  return {
    app: 'Storm Archive',
    version: '1.1',
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events,
    ...(Object.keys(recovery).length ? { recovery } : {})
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

export class ArchiveImportConflictError extends Error {
  constructor(conflicts) {
    super(`В архиве уже есть отличающиеся записи: ${conflicts.length}. Для замены требуется подтверждение. Изменения не применены.`);
    this.name = 'ArchiveImportConflictError';
    this.conflicts = conflicts;
  }
}

const sameRecord = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (!Array.isArray(a) && (!isRecordObject(a) || !isRecordObject(b))) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameRecord(a[key], b[key]));
};

const checkImportConflicts = (existing, incoming, { replaceExisting, expectedConflicts }) => {
  const targets = new Set(incoming.map(event => event.id));
  const seen = new Set();
  for (const event of existing) {
    if (!targets.has(event?.id)) continue;
    if (seen.has(event.id)) throw new Error('В существующем архиве повторяется идентификатор заменяемой записи. Экспортируйте исходные данные перед восстановлением. Изменения не применены.');
    seen.add(event.id);
  }
  const byId = new Map(existing.filter(event => event && typeof event.id === 'string').map(event => [event.id, event]));
  const conflicts = incoming.filter(event => byId.has(event.id) && !sameRecord(event, byId.get(event.id)))
    .map(event => ({ id: event.id, record: byId.get(event.id) }));
  if (conflicts.length && !replaceExisting) throw new ArchiveImportConflictError(conflicts);
  if (expectedConflicts) {
    const expected = new Map(expectedConflicts.map(conflict => [conflict.id, conflict.record]));
    if (conflicts.some(conflict => !expected.has(conflict.id) || !sameRecord(conflict.record, expected.get(conflict.id)))) {
      throw new Error('Архив изменился после запроса подтверждения. Повторно выберите файл, чтобы проверить замену. Изменения не применены.');
    }
  }
};

const changeIndexedDb = (db, work) =>
  new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    let failure;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(failure || transaction.error || new Error('Ошибка изменения IndexedDB'));
    transaction.onabort = () => reject(failure || transaction.error || new Error('Транзакция IndexedDB прервана'));
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        work(store, request.result);
      } catch (err) {
        failure = err;
        transaction.abort();
      }
    };
  });

/** Conflict checks and all writes share a single IndexedDB transaction. */
const commitImport = async (backend, records, options) => {
  if (backend.kind === 'local') {
    const existing = readLocal();
    checkImportConflicts(existing, records, options);
    const incoming = new Map(records.map(record => [record.id, record]));
    const merged = existing.map(record => incoming.has(record?.id) ? incoming.get(record.id) : record);
    const existingIds = new Set(existing.map(record => record?.id));
    merged.push(...records.filter(record => !existingIds.has(record.id)));
    // A single setItem either stores the whole value or leaves the old one intact.
    writeLocal(merged);
    return;
  }
  await changeIndexedDb(backend.db, (store, existing) => {
    checkImportConflicts(existing, records, options);
    records.forEach(record => store.put(record));
  });
};

const transferCandidates = ({ primary, local }) => {
  const byId = new Map(primary.records.map(record => [record?.id, record]));
  const counts = new Map();
  local.records.forEach(record => counts.set(record?.id, (counts.get(record?.id) || 0) + 1));
  return local.records.filter(record => {
    const inspected = inspectEventRecord(record);
    return inspected.record && !inspected.issues.length && counts.get(record.id) === 1
      && (!byId.has(record.id) || sameRecord(record, byId.get(record.id)));
  });
};

/** A reviewable snapshot. Preparing a transfer never changes either source. */
export const prepareStorageMerge = async () => {
  const sources = await writableSources();
  if (sources.backend.kind !== 'idb') throw new Error('Для объединения требуется доступный IndexedDB. Повторите проверку хранилищ.');
  const candidates = transferCandidates(sources);
  return { localRaw: sources.local.rawText, primary: sources.primary.records,
    count: candidates.length, remaining: sources.local.records.length - candidates.length };
};

/** Copy in one transaction, verify committed originals, then prune only that
 * exact local snapshot. A failed cleanup leaves readable, deduplicated copies.
 * No schema upgrade, Blob migration, lossy normalization or photo shrinking. */
export const mergeStorageArchives = (plan) => withStorageLock(async () => {
  const sources = await writableSources();
  if (sources.backend.kind !== 'idb' || sources.local.rawText !== plan.localRaw) throw new Error('Хранилища изменились. Повторно проверьте объединение. Исходные данные сохранены.');
  const candidates = transferCandidates(sources);
  if (!candidates.length) throw new Error('Нет записей для безопасного переноса. Конфликты и повреждённые записи сохранены в localStorage.');
  try {
    await changeIndexedDb(sources.backend.db, (store, existing) => {
      if (!sameRecord(existing, plan.primary)) throw new Error('IndexedDB изменился после подтверждения. Повторите объединение.');
      const ids = new Set(existing.map(record => record?.id));
      candidates.forEach(record => { if (!ids.has(record.id)) store.add(record); });
    });
  } catch (err) {
    throw new Error(`Не удалось завершить копирование. Исходные записи сохранены в localStorage. ${err.message}`);
  }
  let verified;
  try { verified = await getAllRecords(sources.backend.db); } catch {
    throw new Error('Не удалось проверить результат переноса. Исходные записи сохранены в localStorage; повторите проверку и объединение.');
  }
  const byId = new Map(verified.map(record => [record?.id, record]));
  if (!candidates.every(record => sameRecord(record, byId.get(record.id)))) throw new Error('Проверка переноса не завершена. Исходные записи остались в localStorage; повторите проверку.');
  // Do not remove a source that another tab changed while the copy was pending.
  const ids = new Set(candidates.map(record => record.id));
  const remaining = sources.local.records.filter(record => !ids.has(record?.id));
  try {
    if (localStorage.getItem(LOCAL_STORAGE_KEY) !== plan.localRaw) return { copied: candidates.length, cleaned: false };
    // Retain malformed/conflicting rows; do not clear the entire fallback key.
    writeLocal(remaining);
  } catch {
    return { copied: candidates.length, cleaned: false };
  }
  return { copied: candidates.length, cleaned: true };
});

/** Resolve a collision without choosing a winner: retain the main version and
 * give the local version its own identity, preserving all its fields. */
export const keepBothStorageVersions = (conflict) => withStorageLock(async () => {
  const sources = await writableSources();
  const matches = sources.local.records.filter(record => record?.id === conflict.id);
  const primary = sources.primary.records.find(record => record?.id === conflict.id);
  if (sources.backend.kind !== 'idb' || matches.length !== 1 || !sameRecord(matches[0], conflict.local) || !sameRecord(primary, conflict.primary)) throw new Error('Версии изменились. Повторите проверку хранилищ перед разрешением конфликта.');
  if (inspectEventRecord(matches[0]).issues.length) throw new Error('Резервная версия повреждена или содержит неподдерживаемые вложения. Экспортируйте исходные данные для восстановления.');
  const ids = new Set([...sources.primary.records, ...sources.local.records].map(record => record?.id));
  let id;
  do {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    id = `${conflict.id}__local_${suffix}`;
  } while (ids.has(id));
  const retained = { ...matches[0], id, storageRecovery: { source: 'localStorage', originalId: conflict.id,
    ...(Object.prototype.hasOwnProperty.call(matches[0], 'storageRecovery') ? { previous: matches[0].storageRecovery } : {}) } };
  writeLocal(sources.local.records.map(record => record?.id === conflict.id ? retained : record));
  return id;
});

/** Validate the entire file before writing. Imported originals are kept intact. */
export const importArchiveJSON = (file, options = {}) => withStorageLock(async () => {
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
  if (!Array.isArray(data) && (
    (data.app != null && data.app !== 'Storm Archive')
    || (data.version != null && !['1.0', '1.1'].includes(String(data.version)))
    || data.format != null || data.recovery?.localStorageRaw != null || data.recovery?.sources != null
  )) throw new Error('Формат этой копии требует отдельного восстановления. Изменения не применены.');
  if (!Array.isArray(data) && data.eventCount != null && data.eventCount !== rawEvents.length) {
    throw new Error('Количество записей в файле не совпадает с содержимым. Импорт отменён, изменения не применены.');
  }
  const seen = new Set();
  const problems = [];
  rawEvents.forEach((raw, index) => {
    const { record, issues } = inspectEventRecord(raw);
    if (record && seen.has(record.id)) issues.push('Повторяющийся идентификатор');
    if (record) seen.add(record.id);
    if (issues.length) problems.push(`Запись ${index + 1}: ${issues.join('; ')}`);
  });
  if (problems.length) {
    throw new Error(`Импорт отменён: проблемных записей — ${problems.length}. ${problems.slice(0, 3).join('. ')}. Архив не изменён; исходные данные остаются в выбранном файле.`);
  }
  if (rawEvents.length === 0) return { imported: 0, skipped: 0, total: 0 };
  try {
    const sources = await writableSources();
    await commitImport(mutationBackend(sources, rawEvents.map(record => record.id)), rawEvents, options);
  } catch (err) {
    if (isQuotaError(err)) throw new Error('Недостаточно места для импорта. Архив не изменён; фотографии не сжимались.');
    if (err instanceof ArchiveImportConflictError) throw err;
    throw new Error(`${err.message || 'Ошибка сохранения'}. Импорт не применён.`);
  }
  return { imported: rawEvents.length, skipped: 0, total: rawEvents.length };
});

/** Test seam: forces the backend to be re-selected on the next call. */
export const __resetStorageForTests = () => {
  backendPromise = null;
};
