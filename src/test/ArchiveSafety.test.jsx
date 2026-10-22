import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { __resetStorageForTests, buildArchiveExport } from '../services/storage';

const key = 'storm_archive_events';
const event = (id, more = {}) => ({ id, title: id, eventType: 'thunderstorm', photos: [], ...more });
const backupFile = events => new File([JSON.stringify({ events })], 'backup.json', { type: 'application/json' });

beforeEach(() => {
  globalThis.indexedDB = undefined;
  localStorage.clear();
  __resetStorageForTests();
});
afterEach(() => vi.restoreAllMocks());

const openBackup = async user => {
  await user.click(screen.getByRole('button', { name: 'Данные и резервные копии', exact: true }));
  return screen.findByRole('dialog', { name: 'Данные и резервные копии' });
};

describe('archive safety messages and import confirmation', () => {
  it('shows readable events and warns about damage without changing the original archive', async () => {
    const records = [event('correct-a'), event('damaged', { classification: { category: 'mcs', attributes: { structuralFeatures: 'derecho' } } }), event('correct-b')];
    const original = JSON.stringify(records);
    localStorage.setItem(key, original);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'correct-a', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'correct-b', exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Проблемных записей: 1/)).toBeInTheDocument();

    const card = screen.getByRole('button', { name: 'damaged', exact: true }).closest('article');
    await user.click(within(card).getByRole('button', { name: 'Редактировать' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Запись содержит повреждённые данные/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'damaged', exact: true }));
    const detail = await screen.findByRole('dialog', { name: 'damaged', exact: true });
    await user.click(within(detail).getByRole('button', { name: 'Редактировать' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Резервная копия' }));
    const dialog = await screen.findByRole('dialog', { name: 'Данные и резервные копии' });
    expect(within(dialog).getByText(/Некорректные структурные признаки MCS/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Экспорт', exact: true })).toBeEnabled();
    expect(localStorage.getItem(key)).toBe(original);
    expect((await buildArchiveExport()).events).toEqual(records);
  });

  it('offers recovery export even when no record can be displayed', async () => {
    const records = [null, { id: 42, originalPhotos: 'recover me' }];
    localStorage.setItem(key, JSON.stringify(records));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Записи требуют восстановления' })).toBeInTheDocument();
    expect(screen.queryByText('Сохраните первое наблюдение')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Данные и резервные копии', exact: true })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Данные и резервные копии' });
    expect(within(dialog).getByRole('button', { name: 'Экспорт', exact: true })).toBeEnabled();
    expect((await buildArchiveExport()).events).toEqual(records);
  });

  it('explains unparseable local data and enables exporting the original text', async () => {
    localStorage.setItem(key, '{broken archive');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Записи требуют восстановления' });
    await user.click(screen.getAllByRole('button', { name: 'Данные и резервные копии', exact: true })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Данные и резервные копии' });
    expect(within(dialog).getByText(/Не удалось разобрать локальный архив/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Экспорт', exact: true })).toBeEnabled();
    expect((await buildArchiveExport()).recovery.localStorageRaw).toBe('{broken archive');
  });

  it('reports an invalid import without changing any existing data or asking to replace', async () => {
    localStorage.setItem(key, JSON.stringify([event('existing', { photos: [{ url: 'data:image/jpeg;base64,KEEP' }] })]));
    const original = localStorage.getItem(key);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'existing', exact: true });
    const dialog = await openBackup(user);
    await user.upload(dialog.querySelector('input[type="file"]'), backupFile([event('existing'), event('bad', {
      classification: { category: 'mcs', attributes: { structuralFeatures: {} } }
    })]));
    expect(await within(dialog).findByText(/Архив не изменён/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Заменить существующие наблюдения?' })).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('allows cancelling a conflict and applies replacements only after a later confirmation', async () => {
    localStorage.setItem(key, JSON.stringify([event('existing', { title: 'local', photos: [{ url: 'data:image/jpeg;base64,KEEP' }] })]));
    const original = localStorage.getItem(key);
    const incoming = [event('existing', { title: 'imported', photos: [{ url: 'data:image/jpeg;base64,NEW' }] }), event('new')];
    const selectedFile = backupFile(incoming);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'local', exact: true });
    const dialog = await openBackup(user);
    const input = dialog.querySelector('input[type="file"]');
    await user.upload(input, selectedFile);
    let confirmation = await screen.findByRole('dialog', { name: 'Заменить существующие наблюдения?' });
    expect(localStorage.getItem(key)).toBe(original);
    await user.click(within(confirmation).getByRole('button', { name: 'Отмена' }));
    expect(await within(dialog).findByText('Импорт отменён. Архив не изменён.')).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe(original);

    await user.upload(input, selectedFile);
    confirmation = await screen.findByRole('dialog', { name: 'Заменить существующие наблюдения?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Заменить и импортировать' }));
    expect(await within(dialog).findByText('Импортировано наблюдений: 2.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key))).toEqual(incoming);
    expect(screen.getByRole('button', { name: 'imported', exact: true })).toBeInTheDocument();
  });

  it('downloads an export containing unreadable original records', async () => {
    const records = [{ id: 42, original: { photos: 'preserved' } }];
    const original = JSON.stringify(records);
    localStorage.setItem(key, original);
    let exported;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { exported = blob; return 'blob:test'; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Записи требуют восстановления' });
    await user.click(screen.getAllByRole('button', { name: 'Данные и резервные копии', exact: true })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Данные и резервные копии' });
    await user.click(within(dialog).getByRole('button', { name: 'Экспорт', exact: true }));
    await waitFor(() => expect(exported).toBeInstanceOf(Blob));
    const text = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(exported);
    });
    expect(JSON.parse(text).events).toEqual(records);
    expect(localStorage.getItem(key)).toBe(original);
  });
});
