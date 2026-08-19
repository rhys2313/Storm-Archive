const DB_NAME = 'StormArchiveDB';
const DB_VERSION = 1;
const STORE_NAME = 'events';

const openDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getStoredEvents = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage', err);
    const local = localStorage.getItem('storm_archive_events');
    return local ? JSON.parse(local) : [];
  }
};

export const saveEvent = async (eventData) => {
  const now = new Date().toISOString();
  const item = {
    ...eventData,
    updatedAt: now,
    createdAt: eventData.createdAt || now
  };

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const events = await getStoredEvents();
    const idx = events.findIndex(e => e.id === item.id);
    if (idx >= 0) events[idx] = item;
    else events.push(item);
    localStorage.setItem('storm_archive_events', JSON.stringify(events));
    return item;
  }
};

export const deleteEvent = async (id) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const events = await getStoredEvents();
    const filtered = events.filter(e => e.id !== id);
    localStorage.setItem('storm_archive_events', JSON.stringify(filtered));
    return id;
  }
};

export const clearAllEvents = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    localStorage.removeItem('storm_archive_events');
    return true;
  }
};

export const exportArchiveJSON = async () => {
  const events = await getStoredEvents();
  const exportData = {
    app: 'Storm Archive',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `storm_archive_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const importArchiveJSON = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.events)) {
          throw new Error('Некорректный формат файла резервной копии');
        }
        for (const evt of data.events) {
          if (evt.id && evt.title) {
            await saveEvent(evt);
          }
        }
        resolve(data.events.length);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file);
  });
};
