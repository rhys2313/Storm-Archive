import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const DB_NAME = 'StormArchiveDB';
export const DB_VERSION = 2;
export const EVENT_STORE = 'events';
export const ATTACHMENT_STORE = 'attachments';

export const openArchiveDB = () => new Promise((resolve, reject) => {
  if (!window.indexedDB) {
    reject(new Error('IndexedDB not supported'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(EVENT_STORE)) db.createObjectStore(EVENT_STORE, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
      const attachments = db.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
      attachments.createIndex('eventId', 'eventId', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const requestValue = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const completeTransaction = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

const withDatabase = async (callback) => {
  const db = await openArchiveDB();
  try { return await callback(db); } finally { db.close(); }
};

const eventWithTimestamps = (eventData) => {
  const now = new Date().toISOString();
  return { ...eventData, updatedAt: now, createdAt: eventData.createdAt || now };
};

const getLocalFallbackEvents = () => {
  const local = localStorage.getItem('storm_archive_events');
  return local ? JSON.parse(local) : [];
};

const saveLocalFallbackEvent = (item) => {
  const events = getLocalFallbackEvents();
  const index = events.findIndex(event => event.id === item.id);
  if (index >= 0) events[index] = item;
  else events.push(item);
  localStorage.setItem('storm_archive_events', JSON.stringify(events));
  return item;
};

export const getStoredEvents = async () => {
  try {
    return await withDatabase(async (db) => {
      const transaction = db.transaction(EVENT_STORE, 'readonly');
      const events = await requestValue(transaction.objectStore(EVENT_STORE).getAll());
      await completeTransaction(transaction);
      return events || [];
    });
  } catch (error) {
    console.warn('IndexedDB unavailable, falling back to localStorage for event metadata only', error);
    return getLocalFallbackEvents();
  }
};

export const saveEvent = async (eventData) => {
  const item = eventWithTimestamps(eventData);
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction(EVENT_STORE, 'readwrite');
      transaction.objectStore(EVENT_STORE).put(item);
      await completeTransaction(transaction);
    });
    return item;
  } catch (error) {
    return saveLocalFallbackEvent(item);
  }
};

export const saveEventWithAttachments = async (eventData, { newAttachments = [], attachmentIdsToDelete = [] } = {}) => {
  const item = eventWithTimestamps(eventData);
  if (!newAttachments.length && !attachmentIdsToDelete.length) return saveEvent(item);
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction([EVENT_STORE, ATTACHMENT_STORE], 'readwrite');
      const events = transaction.objectStore(EVENT_STORE);
      const attachments = transaction.objectStore(ATTACHMENT_STORE);
      newAttachments.forEach(attachment => attachments.put(attachment));
      attachmentIdsToDelete.forEach(id => attachments.delete(id));
      events.put(item);
      await completeTransaction(transaction);
    });
    return item;
  } catch (error) {
    throw new Error('Не удалось сохранить событие и вложения локально. Ничего не было сохранено.', { cause: error });
  }
};

export const deleteEvent = async (id) => {
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction([EVENT_STORE, ATTACHMENT_STORE], 'readwrite');
      transaction.objectStore(EVENT_STORE).delete(id);
      const attachments = transaction.objectStore(ATTACHMENT_STORE);
      const cursorRequest = attachments.index('eventId').openCursor(IDBKeyRange.only(id));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await completeTransaction(transaction);
    });
    return id;
  } catch (error) {
    if (!window.indexedDB) {
      const filtered = getLocalFallbackEvents().filter(event => event.id !== id);
      localStorage.setItem('storm_archive_events', JSON.stringify(filtered));
      return id;
    }
    throw new Error('Не удалось удалить событие вместе с его вложениями.', { cause: error });
  }
};

export const clearAllEvents = async () => {
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction([EVENT_STORE, ATTACHMENT_STORE], 'readwrite');
      transaction.objectStore(EVENT_STORE).clear();
      transaction.objectStore(ATTACHMENT_STORE).clear();
      await completeTransaction(transaction);
    });
    return true;
  } catch (error) {
    if (!window.indexedDB) {
      localStorage.removeItem('storm_archive_events');
      return true;
    }
    throw new Error('Не удалось очистить архив вместе с вложениями.', { cause: error });
  }
};

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

const getAttachmentRecords = async (ids) => withDatabase(async (db) => {
  const transaction = db.transaction(ATTACHMENT_STORE, 'readonly');
  const store = transaction.objectStore(ATTACHMENT_STORE);
  const records = await Promise.all(ids.map(id => requestValue(store.get(id))));
  await completeTransaction(transaction);
  return records.filter(Boolean);
});

const attachmentManifest = (attachment) => ({
  id: attachment.id, eventId: attachment.eventId, kind: attachment.kind, name: attachment.name,
  mimeType: attachment.mimeType, size: attachment.size, originalSize: attachment.originalSize,
  createdAt: attachment.createdAt, updatedAt: attachment.updatedAt, lastModified: attachment.lastModified,
  metadata: attachment.metadata || {}, sync: attachment.sync || { state: 'local', provider: null, remoteId: null },
  backupPath: `attachments/${attachment.id}`
});

export const exportArchiveBackup = async () => {
  const events = await getStoredEvents();
  const ids = [...new Set(events.flatMap(event => (event.attachmentRefs || []).map(ref => ref.id)))];
  const attachments = await getAttachmentRecords(ids);
  const manifest = {
    app: 'Storm Archive', version: '2.0', format: 'storm-archive-zip', exportedAt: new Date().toISOString(),
    eventCount: events.length, events, attachments: attachments.map(attachmentManifest)
  };
  const files = { 'archive.json': strToU8(JSON.stringify(manifest, null, 2)) };
  await Promise.all(attachments.map(async (attachment) => {
    files[`attachments/${attachment.id}`] = new Uint8Array(await attachment.blob.arrayBuffer());
  }));
  const zip = zipSync(files, { level: 6 });
  downloadBlob(new Blob([zip], { type: 'application/zip' }), `storm_archive_backup_${new Date().toISOString().slice(0, 10)}.zip`);
};

const importRecords = async (events, attachments = []) => {
  try {
    await withDatabase(async (db) => {
      const transaction = db.transaction([EVENT_STORE, ATTACHMENT_STORE], 'readwrite');
      const eventStore = transaction.objectStore(EVENT_STORE);
      const attachmentStore = transaction.objectStore(ATTACHMENT_STORE);
      attachments.forEach(attachment => attachmentStore.put(attachment));
      events.forEach(event => { if (event.id && event.title) eventStore.put(eventWithTimestamps(event)); });
      await completeTransaction(transaction);
    });
  } catch (error) {
    if (attachments.length) throw new Error('Не удалось импортировать вложения: IndexedDB недоступен.', { cause: error });
    events.forEach(event => { if (event.id && event.title) saveLocalFallbackEvent(eventWithTimestamps(event)); });
  }
};

const importJsonBackup = async (file) => {
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.events)) throw new Error('Некорректный формат файла резервной копии');
  await importRecords(data.events);
  return data.events.length;
};

const importZipBackup = async (file) => {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  if (!archive['archive.json']) throw new Error('В архиве отсутствует archive.json');
  const data = JSON.parse(strFromU8(archive['archive.json']));
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.attachments)) throw new Error('Некорректный формат резервной копии');
  const attachments = data.attachments.map(metadata => {
    const bytes = archive[metadata.backupPath];
    if (!bytes) throw new Error(`В архиве отсутствует вложение «${metadata.name || metadata.id}»`);
    const { backupPath, ...record } = metadata;
    return { ...record, blob: new Blob([bytes], { type: metadata.mimeType || 'application/octet-stream' }) };
  });
  await importRecords(data.events, attachments);
  return data.events.length;
};

export const importArchiveBackup = async (file) => {
  const isZip = file.type === 'application/zip' || /\.zip$/i.test(file.name || '');
  return isZip ? importZipBackup(file) : importJsonBackup(file);
};
