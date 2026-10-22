import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import App from '../App';
import { __resetStorageForTests, getStoredArchive } from '../services/storage';

const key = 'storm_archive_events';
const event = (id, title = id) => ({ id, title, photos: [], eventType: 'thunderstorm' });
const seed = async (records, version = 1) => {
  const db = await new Promise(resolve => {
    const request = indexedDB.open('StormArchiveDB', version);
    request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise(resolve => {
    const tx = db.transaction('events', 'readwrite');
    records.forEach(record => tx.objectStore('events').put(record));
    tx.oncomplete = resolve;
  });
  db.close();
};
const backup = async user => {
  await user.click(screen.getByRole('button', { name: 'Данные и резервные копии', exact: true }));
  return screen.findByRole('dialog', { name: 'Данные и резервные копии' });
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  __resetStorageForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('storage backend recovery through the application', () => {
  it('does not call the archive empty when IndexedDB is empty but fallback cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    render(<App />);
    await screen.findByRole('heading', { name: 'Не удалось проверить весь архив', exact: true });
    expect(screen.getByText(/Нет доступа к localStorage/)).toBeInTheDocument();
    expect(screen.queryByText('Сохраните первое наблюдение')).not.toBeInTheDocument();
  });
  it('shows fallback records, retries access, and reveals both stores without changing originals', async () => {
    await seed([event('primary')]);
    localStorage.setItem(key, JSON.stringify([event('reserve')]));
    const original = localStorage.getItem(key);
    const factory = indexedDB;
    globalThis.indexedDB = undefined;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'reserve', exact: true });
    expect(screen.queryByText('Сохраните первое наблюдение')).not.toBeInTheDocument();
    expect(screen.getByText(/основной архив не проверен/)).toBeInTheDocument();
    const dialog = await backup(user);
    expect(within(dialog).getByText('Доступных записей')).toBeInTheDocument();
    globalThis.indexedDB = factory;
    await user.click(within(dialog).getByRole('button', { name: 'Проверить хранилища' }));
    await within(dialog).findByText(/Проверка хранилищ завершена/);
    expect(screen.getByRole('button', { name: 'primary', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reserve', exact: true })).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('requires confirmation to consolidate, supports cancellation, and retains records after remount', async () => {
    await seed([event('primary')]);
    localStorage.setItem(key, JSON.stringify([event('reserve')]));
    const original = localStorage.getItem(key);
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole('button', { name: 'reserve', exact: true });
    const dialog = await backup(user);
    await user.click(within(dialog).getByRole('button', { name: 'Объединить хранилища' }));
    let confirmation = await screen.findByRole('dialog', { name: 'Объединить хранилища?' });
    expect(localStorage.getItem(key)).toBe(original);
    await user.click(within(confirmation).getByRole('button', { name: 'Отмена' }));
    expect(localStorage.getItem(key)).toBe(original);
    await user.click(within(dialog).getByRole('button', { name: 'Объединить хранилища' }));
    confirmation = await screen.findByRole('dialog', { name: 'Объединить хранилища?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Объединить', exact: true }));
    await within(dialog).findByText(/Объединение завершено/);
    expect(JSON.parse(localStorage.getItem(key))).toEqual([]);
    expect((await getStoredArchive()).events).toHaveLength(2);
    view.unmount();
    __resetStorageForTests();
    render(<App />);
    await screen.findByRole('button', { name: 'reserve', exact: true });
    expect(screen.getAllByRole('button', { name: 'primary', exact: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'reserve', exact: true })).toHaveLength(1);
  });

  it('explains a collision and retains both complete versions only after confirmation', async () => {
    await seed([event('same', 'Primary version')]);
    localStorage.setItem(key, JSON.stringify([event('same', 'Reserve version')]));
    const original = localStorage.getItem(key);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Primary version', exact: true });
    const dialog = await backup(user);
    expect(within(dialog).getByText(/Конфликт «same»/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить обе версии' }));
    let confirmation = await screen.findByRole('dialog', { name: 'Сохранить обе версии?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Отмена' }));
    expect(localStorage.getItem(key)).toBe(original);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить обе версии' }));
    confirmation = await screen.findByRole('dialog', { name: 'Сохранить обе версии?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Сохранить обе', exact: true }));
    await within(dialog).findByText(/Обе версии сохранены как отдельные/);
    expect(screen.getByRole('button', { name: 'Primary version', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reserve version', exact: true })).toBeInTheDocument();
    expect((await getStoredArchive()).storage.conflicts).toEqual([]);
  });

  it.each([false, true])('diagnoses a newer database without showing a false empty archive (fallback=%s)', async hasFallback => {
    await seed([event('future')], 2);
    if (hasFallback) localStorage.setItem(key, JSON.stringify([event('reserve')]));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Схема IndexedDB \(версия 2\)/);
    expect(screen.queryByText('Сохраните первое наблюдение')).not.toBeInTheDocument();
    if (!hasFallback) expect(screen.getByRole('heading', { name: 'Основной архив недоступен' })).toBeInTheDocument();
    else expect(screen.getByRole('button', { name: 'reserve', exact: true })).toBeInTheDocument();
    const dialog = await backup(user);
    expect(within(dialog).getByRole('button', { name: 'Экспорт', exact: true })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Выбрать файл', exact: true })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Очистить', exact: true })).toBeDisabled();
  });

  it('reports a failed transfer and allows a later retry with the original source intact', async () => {
    localStorage.setItem(key, JSON.stringify([event('reserve')]));
    const original = localStorage.getItem(key);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'reserve', exact: true });
    const dialog = await backup(user);
    const fail = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => { throw new Error('test transfer failure'); });
    await user.click(within(dialog).getByRole('button', { name: 'Объединить хранилища' }));
    let confirmation = await screen.findByRole('dialog', { name: 'Объединить хранилища?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Объединить', exact: true }));
    await within(dialog).findByText(/Не удалось завершить копирование.*test transfer failure/);
    expect(localStorage.getItem(key)).toBe(original);
    expect(screen.getByRole('button', { name: 'reserve', exact: true })).toBeInTheDocument();
    fail.mockRestore();
    await user.click(within(dialog).getByRole('button', { name: 'Объединить хранилища' }));
    confirmation = await screen.findByRole('dialog', { name: 'Объединить хранилища?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Объединить', exact: true }));
    await within(dialog).findByText(/Объединение завершено/);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key))).toEqual([]));
  });
});
