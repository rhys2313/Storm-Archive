import { parsePhotoMetadata } from './exif.js';
import { ATTACHMENT_STORE, EVENT_STORE, openArchiveDB } from './storage.js';

const MAX_PHOTO_EDGE = 2560;
const PHOTO_QUALITY = 0.92;

export class AttachmentStorageError extends Error {
  constructor(message, code = 'storage-error', cause) {
    super(message);
    this.name = 'AttachmentStorageError';
    this.code = code;
    this.cause = cause;
  }
}

const createId = () => globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isPhoto = (file) => file.type?.startsWith('image/');
const kindFor = (file) => isPhoto(file) ? 'photo' : file.type?.startsWith('video/') ? 'video' : 'file';
const isQuotaError = (error) => error?.name === 'QuotaExceededError' || error?.code === 22;

const requestValue = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transactionComplete = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

const withStore = async (mode, callback) => {
  const db = await openArchiveDB();
  try {
    const transaction = db.transaction(ATTACHMENT_STORE, mode);
    const value = await callback(transaction.objectStore(ATTACHMENT_STORE), transaction);
    await transactionComplete(transaction);
    return value;
  } finally {
    db.close();
  }
};

const loadImage = async (file) => {
  if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const optimizedPhotoBlob = async (file) => {
  const source = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', PHOTO_QUALITY));
    if (!blob) throw new AttachmentStorageError('Не удалось оптимизировать фотографию.', 'image-processing');
    const applied = blob.size < file.size || scale < 1;
    return {
      blob: applied ? blob : file,
      mimeType: applied ? 'image/webp' : file.type,
      optimization: { originalSize: file.size, width, height, applied }
    };
  } finally {
    if ('close' in source) source.close();
  }
};

export const makeAttachmentRef = (attachment) => ({
  id: attachment.id,
  kind: attachment.kind,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  createdAt: attachment.createdAt,
  metadata: attachment.metadata || {}
});

export const getStorageEstimate = async () => {
  if (!navigator.storage?.estimate) return null;
  const [estimate, persistent] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted ? navigator.storage.persisted().catch(() => false) : false
  ]);
  return { usage: estimate.usage || 0, quota: estimate.quota || 0, persistent: Boolean(persistent) };
};

export const requestPersistentStorage = async () => {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
};

const ensureCapacity = async (requiredBytes) => {
  const estimate = await getStorageEstimate();
  if (estimate?.quota && estimate.quota - estimate.usage < requiredBytes) {
    throw new AttachmentStorageError('Недостаточно места в локальном хранилище для выбранных вложений.', 'quota');
  }
};

export const prepareAttachments = async (files, eventId) => {
  const input = Array.from(files || []);
  const prepared = await Promise.all(input.map(async (file) => {
    const kind = kindFor(file);
    const photoMetadata = kind === 'photo' ? await parsePhotoMetadata(file) : { exif: {} };
    let stored = { blob: file, mimeType: file.type || 'application/octet-stream', optimization: null };
    if (kind === 'photo') {
      try {
        stored = await optimizedPhotoBlob(file);
      } catch (error) {
        stored = { blob: file, mimeType: file.type || 'application/octet-stream', optimization: { originalSize: file.size, applied: false, reason: error?.code || 'unavailable' } };
      }
    }
    const createdAt = new Date().toISOString();
    return {
      id: createId(), eventId, kind, name: file.name || 'Без названия', mimeType: stored.mimeType,
      size: stored.blob.size, originalSize: file.size, createdAt, updatedAt: createdAt,
      lastModified: file.lastModified || null,
      metadata: {
        capturedAt: photoMetadata.date || null,
        latitude: Number.isFinite(photoMetadata.lat) ? photoMetadata.lat : null,
        longitude: Number.isFinite(photoMetadata.lng) ? photoMetadata.lng : null,
        exif: photoMetadata.exif || {},
        optimization: stored.optimization
      },
      sync: { state: 'local', provider: null, remoteId: null },
      blob: stored.blob
    };
  }));
  await ensureCapacity(prepared.reduce((total, attachment) => total + attachment.size, 0));
  return prepared;
};

export const getAttachments = async (ids) => {
  const uniqueIds = [...new Set(ids || [])];
  if (!uniqueIds.length) return [];
  return withStore('readonly', async (store) => {
    const records = await Promise.all(uniqueIds.map(id => requestValue(store.get(id))));
    const byId = new Map(records.filter(Boolean).map(record => [record.id, record]));
    return uniqueIds.map(id => byId.get(id)).filter(Boolean);
  });
};

export const deleteAttachment = async (id) => {
  try {
    await withStore('readwrite', (store) => { store.delete(id); });
  } catch (error) {
    throw new AttachmentStorageError('Не удалось удалить вложение.', 'delete-failed', error);
  }
};

const dataUrlToBlob = async (value) => (await fetch(value)).blob();

export const migrateLegacyBase64Events = async (events) => {
  const candidates = [];
  for (const event of events) {
    const photos = event.photos || [];
    const base64Photos = photos.filter(photo => /^data:/i.test(photo.url || ''));
    if (!base64Photos.length) continue;
    try {
      const records = await Promise.all(base64Photos.map(async (photo, index) => {
        const photoIndex = photos.indexOf(photo);
        const blob = await dataUrlToBlob(photo.url);
        const id = `legacy-photo-${event.id}-${photo.id || photoIndex || index}`;
        const createdAt = event.createdAt || new Date().toISOString();
        return {
          id, eventId: event.id, kind: 'photo', name: photo.name || `legacy-photo-${photoIndex + 1}`,
          mimeType: blob.type || 'image/jpeg', size: blob.size, originalSize: blob.size,
          createdAt, updatedAt: new Date().toISOString(), lastModified: null,
          metadata: { caption: photo.caption || '', exif: photo.exif || {}, migratedFrom: 'event.photos.base64' },
          sync: { state: 'local', provider: null, remoteId: null }, blob
        };
      }));
      candidates.push({ event, records });
    } catch (error) {
      console.warn(`Legacy attachment migration skipped for event ${event.id}`, error);
    }
  }
  if (!candidates.length) return { events, migrated: 0 };

  const db = await openArchiveDB();
  try {
    const transaction = db.transaction([EVENT_STORE, ATTACHMENT_STORE], 'readwrite');
    const eventStore = transaction.objectStore(EVENT_STORE);
    const attachmentStore = transaction.objectStore(ATTACHMENT_STORE);
    const replacements = new Map();
    candidates.forEach(({ event, records }) => {
      records.forEach(record => attachmentStore.put(record));
      const convertedIds = new Set(records.map(record => record.id));
      const existingRefs = (event.attachmentRefs || []).filter(reference => !convertedIds.has(reference.id));
      const refs = [...existingRefs, ...records.map(makeAttachmentRef)];
      const remainingPhotos = (event.photos || []).filter(photo => !/^data:/i.test(photo.url || ''));
      const nextEvent = { ...event, attachmentRefs: refs };
      if (remainingPhotos.length) nextEvent.photos = remainingPhotos;
      else delete nextEvent.photos;
      eventStore.put(nextEvent);
      replacements.set(event.id, nextEvent);
    });
    await transactionComplete(transaction);
    return { events: events.map(event => replacements.get(event.id) || event), migrated: candidates.length };
  } finally {
    db.close();
  }
};

export const localAttachmentStorageProvider = Object.freeze({
  id: 'indexeddb-local', prepareAttachments, getAttachments, deleteAttachment,
  getStorageEstimate, requestPersistentStorage
});
