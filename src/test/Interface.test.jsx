import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import App from '../App';
import EventFormModal from '../components/EventFormModal';
import EventCard from '../components/EventCard';
import ArchiveImage from '../components/ArchiveImage';
import StatsView from '../components/StatsView';
import { __resetStorageForTests, getStoredArchive } from '../services/storage';
import * as storage from '../services/storage';
import { parsePhotoMetadata } from '../services/exif';
import { preparePhotoFromFile } from '../services/photos';

vi.mock('../services/exif', async original => ({ ...await original(), parsePhotoMetadata: vi.fn() }));
vi.mock('../services/photos', async original => ({ ...await original(), preparePhotoFromFile: vi.fn() }));
const photo = index => ({ id: `p${index}`, url: 'data:image/jpeg;base64,dGVzdA==', caption: `Caption ${index}` });
const event = (id, extra = {}) => ({ id, title: `Observation ${id}`, date: '2020-06-15T18:30', eventType: 'thunderstorm', severity: 'moderate', photos: [], ...extra });
const form = props => {
  const onSave = vi.fn(); const onClose = vi.fn();
  render(<EventFormModal onSave={onSave} onClose={onClose} {...props} />);
  return { onSave, onClose };
};
const submit = () => userEvent.click(screen.getByRole('button', { name: /Сохранить (в архив|изменения)/ }));
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); localStorage.clear(); __resetStorageForTests();
  vi.clearAllMocks();
  parsePhotoMetadata.mockResolvedValue({ date: null, lat: null, lng: null, exif: {} });
  preparePhotoFromFile.mockResolvedValue({ url: photo(1).url, thumb: photo(1).url });
});
afterEach(() => vi.restoreAllMocks());

it('focuses the required title and connects its error to the input', async () => {
  const { onSave } = form(); await submit();
  const input = screen.getByLabelText(/Название явления/);
  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(/Укажите название/);
  expect(onSave).not.toHaveBeenCalled();
});

it.each([
  ['95', '44', 'Широта'], ['56', '-200', 'Долгота'], ['56', '', 'Долгота'], ['', '44', 'Широта']
])('focuses the invalid or missing coordinate for %s / %s', async (latitude, longitude, target) => {
  const { onSave } = form();
  fireEvent.change(screen.getByLabelText(/Название явления/), { target: { value: 'Storm' } });
  fireEvent.change(screen.getByLabelText('Широта'), { target: { value: latitude } });
  fireEvent.change(screen.getByLabelText('Долгота'), { target: { value: longitude } });
  await submit();
  await waitFor(() => expect(screen.getByLabelText(target)).toHaveFocus());
  expect(screen.getByLabelText(target)).toHaveAttribute('aria-invalid', 'true');
  expect(onSave).not.toHaveBeenCalled();
});

it('prevents edits during a save and returns focus to a failed save explanation', async () => {
  let reject;
  const onSave = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
  form({ eventToEdit: event('saved'), onSave });
  await submit();
  expect(screen.getByLabelText(/Название явления/)).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
  await act(async () => reject(new Error('Storage unavailable')));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
  expect(screen.getByLabelText(/Название явления/)).toHaveValue('Observation saved');
  expect(screen.getByLabelText(/Название явления/)).not.toBeDisabled();
});

it('previews an attached photo without saving or closing the form', async () => {
  const { onSave, onClose } = form({ eventToEdit: event('draft', { photos: [photo(1), photo(2)] }) });
  const opener = screen.getByRole('button', { name: 'Просмотреть снимок 1' });
  await userEvent.click(opener);
  expect(screen.getByRole('dialog', { name: /Просмотр фотографии 1 из 2/ })).toBeInTheDocument();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('dialog', { name: /Просмотр фотографии 2 из 2/ })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog', { name: /Редактирование наблюдения/ })).toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(onSave).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
});

it('collapses extra photo rows without removing photos and saves edited hidden captions', async () => {
  const original = Array.from({ length: 8 }, (_, index) => photo(index));
  const { onSave } = form({ eventToEdit: event('photos', { photos: original }) });
  expect(screen.queryByRole('textbox', { name: 'Подпись к снимку 8' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Показать остальные снимки (4)' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Подпись к снимку 8' }), { target: { value: 'Updated caption' } });
  await userEvent.click(screen.getByRole('button', { name: 'Свернуть список снимков' }));
  await submit();
  const saved = onSave.mock.calls[0][0];
  expect(saved.photos).toHaveLength(8);
  expect(saved.photos[7]).toEqual({ ...original[7], caption: 'Updated caption' });
  expect(original[7].caption).toBe('Caption 7');
});

it('protects a pending photo upload even if the form has not been edited yet', async () => {
  let resolve;
  parsePhotoMetadata.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { onClose } = form();
  fireEvent.change(document.querySelector('#photo-upload-input'), { target: { files: [new File(['test'], 'test.jpg', { type: 'image/jpeg' })] } });
  const leave = new Event('beforeunload', { cancelable: true });
  fireEvent(window, leave); expect(leave.defaultPrevented).toBe(true);
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog', { name: 'Закрыть без сохранения?' })).toHaveTextContent('Снимки ещё обрабатываются');
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
  await act(async () => resolve({ date: null, lat: null, lng: null, exif: {} }));
  await waitFor(() => expect(document.querySelectorAll('.form-photo-row')).toHaveLength(1));
});

it('shows a failed image clearly and retries presentation when the source changes', () => {
  const view = render(<ArchiveImage src="data:image/jpeg;base64,YmFk" alt="Storm photo" className="photo-thumb" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img', { name: 'Снимок недоступен: Storm photo' })).toBeInTheDocument();
  view.rerender(<ArchiveImage src={photo(1).url} alt="Storm photo" className="photo-thumb" />);
  expect(screen.getByRole('img', { name: 'Storm photo' })).toHaveAttribute('src', photo(1).url);
});

it('opens a card by its content while edit and delete remain independent', async () => {
  const onView = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn(); const saved = event('card', { notes: 'Field notes' });
  render(<EventCard event={saved} onView={onView} onEdit={onEdit} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Field notes')); expect(onView).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  expect(onEdit).toHaveBeenCalledWith(saved); expect(onView).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Редактировать' })).toHaveAccessibleDescription(saved.title);
  await userEvent.click(screen.getByRole('button', { name: 'Удалить' })); expect(onDelete).toHaveBeenCalledWith('card');
});

async function archive(events) {
  await new Promise((done, fail) => {
    const request = indexedDB.open('StormArchiveDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('events', 'readwrite');
      events.forEach(item => tx.objectStore('events').add(item));
      tx.oncomplete = () => { db.close(); done(); }; tx.onerror = () => fail(tx.error);
    };
    request.onerror = () => fail(request.error);
  });
  render(<App />);
  await screen.findByLabelText('Поиск по архиву');
}

it('reveals a large archive progressively while searching all records and preserving originals', async () => {
  const originals = Array.from({ length: 80 }, (_, index) => event(String(index).padStart(3, '0')));
  await archive(originals);
  expect(screen.getAllByRole('article')).toHaveLength(36);
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё наблюдения' }));
  expect(screen.getAllByRole('article')).toHaveLength(72);
  await userEvent.type(screen.getByLabelText('Поиск по архиву'), 'Observation 079');
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Observation 079' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
  expect(screen.getByLabelText('Поиск по архиву')).toHaveFocus();
  expect((await getStoredArchive()).events).toHaveLength(80);
});

it('retains gallery filters and revealed photos across section navigation and browser history', async () => {
  await archive([event('photos', { photos: Array.from({ length: 60 }, (_, index) => photo(index)) }), event('hail', { eventType: 'hail', photos: [photo(99)] })]);
  const tabs = within(screen.getAllByRole('navigation', { name: 'Разделы' })[0]);
  await userEvent.click(tabs.getByRole('button', { name: 'Галерея' }));
  expect(window.location.hash).toBe('#gallery');
  await userEvent.selectOptions(screen.getByLabelText('Фильтр по группе явлений'), 'thunderstorm');
  expect(document.querySelectorAll('.gallery-card')).toHaveLength(48);
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё снимки' }));
  expect(document.querySelectorAll('.gallery-card')).toHaveLength(60);
  await userEvent.click(tabs.getByRole('button', { name: 'Статистика' }));
  window.history.back();
  await waitFor(() => expect(screen.getByLabelText('Фильтр по группе явлений')).toHaveValue('thunderstorm'));
  expect(document.querySelectorAll('.gallery-card')).toHaveLength(60);
});

it('announces monthly counts and explains observations without dates', () => {
  render(<StatsView events={[event('dated'), event('undated', { date: '' })]} onOpenAddModal={() => {}} />);
  expect(screen.getByRole('img', { name: /Количество наблюдений по месяцам:/ })).toHaveAccessibleName(/Июн — 1/);
  expect(screen.getByText(/Без даты: 1/)).toBeInTheDocument();
});

it('shows an archive failure in every section instead of reporting false empty collections', async () => {
  vi.spyOn(storage, 'getStoredArchive').mockRejectedValue(new Error('Archive unavailable'));
  render(<App />);
  await screen.findByRole('heading', { name: 'Архив не открылся' });
  const tabs = within(screen.getAllByRole('navigation', { name: 'Разделы' })[0]);
  for (const name of ['Галерея', 'Статистика', 'Карта']) {
    await userEvent.click(tabs.getByRole('button', { name }));
    expect(screen.getByRole('heading', { name: 'Архив не открылся' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Галерея пуста' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  }
});

it('offers an existing archive when the gallery has no photos', async () => {
  await archive([event('without-photos')]);
  const tabs = within(screen.getAllByRole('navigation', { name: 'Разделы' })[0]);
  await userEvent.click(tabs.getByRole('button', { name: 'Галерея' }));
  await userEvent.click(screen.getByRole('button', { name: 'Открыть архив' }));
  expect(screen.getByRole('button', { name: 'Observation without-photos' })).toBeInTheDocument();
});
