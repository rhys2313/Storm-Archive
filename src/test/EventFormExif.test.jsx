import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventFormModal from '../components/EventFormModal';
import { parsePhotoMetadata } from '../services/exif';
import { preparePhotoFromFile } from '../services/photos';

vi.mock('../services/exif', async (importOriginal) => ({
  ...await importOriginal(), parsePhotoMetadata: vi.fn()
}));
vi.mock('../services/photos', async (importOriginal) => ({
  ...await importOriginal(), preparePhotoFromFile: vi.fn()
}));

const firstDate = '2020-06-15T18:30';
const laterDate = '2021-07-16T19:45';
const manualDate = '2019-08-20T10:15';
const metadata = (date = null, lat = null, lng = null, exif = {}) => ({ date, lat, lng, exif });
const dateInput = () => screen.getByLabelText('Дата и время явления');
const changeDate = value => fireEvent.change(dateInput(), { target: { value } });
const start = (eventToEdit) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<StrictMode><EventFormModal eventToEdit={eventToEdit} onSave={onSave} onClose={onClose} /></StrictMode>);
  return { onSave, onClose };
};
const upload = async (...metas) => {
  const previous = document.querySelectorAll('.form-photo-row').length;
  metas.forEach(meta => parsePhotoMetadata.mockResolvedValueOnce(meta));
  fireEvent.change(document.querySelector('#photo-upload-input'), {
    target: { files: metas.map((_, index) => new File(['test'], `photo-${index}.jpg`, { type: 'image/jpeg' })) }
  });
  await waitFor(() => expect(document.querySelectorAll('.form-photo-row')).toHaveLength(previous + metas.length));
};

beforeEach(() => {
  vi.resetAllMocks();
  preparePhotoFromFile.mockResolvedValue({ url: 'data:image/jpeg;base64,dGVzdA==', thumb: 'data:image/jpeg;base64,dGh1bWI=' });
});

describe('EXIF date selection', () => {
  it('replaces the new form default with the first suitable photo in a batch', async () => {
    start();
    expect(dateInput().value).not.toBe('');
    await upload(metadata(), metadata(firstDate), metadata(laterDate));
    expect(dateInput()).toHaveValue(firstDate);
    expect(screen.getByText('Из EXIF извлечено: дату съёмки.')).toBeInTheDocument();
  });

  it('keeps the first EXIF date across later batches, including photos without EXIF', async () => {
    start();
    const defaultDate = dateInput().value;
    await upload(metadata());
    expect(dateInput()).toHaveValue(defaultDate);
    await upload(metadata(firstDate));
    await upload(metadata(laterDate), metadata());
    expect(dateInput()).toHaveValue(firstDate);
  });

  it.each([firstDate, '', undefined])('preserves the saved event date %j when adding photos', async date => {
    start({ id: 'saved', title: 'Saved event', date, photos: [] });
    await upload(metadata(laterDate));
    await upload(metadata(firstDate));
    expect(dateInput()).toHaveValue(date || '');
  });

  it.each([manualDate, ''])('preserves manual selection %j before any upload', async date => {
    start();
    changeDate(date);
    await upload(metadata(firstDate));
    await upload(metadata(laterDate));
    expect(dateInput()).toHaveValue(date);
  });

  it.each([manualDate, ''])('preserves manual selection %j after EXIF autofill', async date => {
    start();
    await upload(metadata(firstDate));
    changeDate(date);
    await upload(metadata(laterDate));
    expect(dateInput()).toHaveValue(date);
  });

  it.each([manualDate, ''])('respects manual selection %j while metadata is being read', async date => {
    start();
    let resolve;
    parsePhotoMetadata.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    fireEvent.change(document.querySelector('#photo-upload-input'), {
      target: { files: [new File(['test'], 'pending.jpg', { type: 'image/jpeg' })] }
    });
    changeDate(date);
    await act(async () => resolve(metadata(firstDate, 0, 0)));
    await waitFor(() => expect(document.querySelectorAll('.form-photo-row')).toHaveLength(1));
    expect(dateInput()).toHaveValue(date);
    expect(screen.getByLabelText('Широта')).toHaveValue('0');
    expect(screen.getByLabelText('Долгота')).toHaveValue('0');
  });

  it('fills GPS independently of a protected date and preserves photo settings on save', async () => {
    const { onSave } = start({ id: 'saved', title: 'Saved event', date: manualDate, photos: [] });
    const exif = { camera: 'Test camera', focalLength: '50mm', iso: 'ISO 200', aperture: 'f/4', exposure: '1/250s' };
    await upload(metadata(firstDate, 56.5, 44.25, exif));
    await upload(metadata(laterDate, 57.5, 45.25));
    expect(screen.getByLabelText('Широта')).toHaveValue('56.5');
    expect(screen.getByLabelText('Долгота')).toHaveValue('44.25');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ date: manualDate, latitude: 56.5, longitude: 44.25 });
    expect(saved.photos[0].exif).toEqual(exif);
    expect(saved).not.toHaveProperty('dateSource');
    expect(saved).not.toHaveProperty('exifAutofill');
  });

  it('does not overwrite manual or partially entered coordinates', async () => {
    start();
    fireEvent.change(screen.getByLabelText('Широта'), { target: { value: '-' } });
    await upload(metadata(firstDate, 56.5, 44.25));
    expect(dateInput()).toHaveValue(firstDate);
    expect(screen.getByLabelText('Широта')).toHaveValue('-');
    expect(screen.getByLabelText('Долгота')).toHaveValue('');
  });

  it('takes metadata only from successfully added photos in a mixed batch', async () => {
    start();
    preparePhotoFromFile.mockRejectedValueOnce(new Error('Failed file read'));
    parsePhotoMetadata.mockResolvedValueOnce(metadata(firstDate, 1, 2));
    parsePhotoMetadata.mockResolvedValueOnce(metadata(laterDate, 3, 4));
    fireEvent.change(document.querySelector('#photo-upload-input'), {
      target: { files: ['bad.jpg', 'good.jpg'].map(name => new File(['test'], name, { type: 'image/jpeg' })) }
    });
    await screen.findByText(/Пропущено файлов: 1/);
    expect(document.querySelectorAll('.form-photo-row')).toHaveLength(1);
    expect(dateInput()).toHaveValue(laterDate);
    expect(screen.getByLabelText('Широта')).toHaveValue('3');
  });

  it('keeps the default eligible after a batch in which every file failed', async () => {
    start();
    const defaultDate = dateInput().value;
    preparePhotoFromFile.mockRejectedValueOnce(new Error('Failed file read'));
    parsePhotoMetadata.mockResolvedValueOnce(metadata(firstDate, 1, 2));
    fireEvent.change(document.querySelector('#photo-upload-input'), {
      target: { files: [new File(['test'], 'bad.jpg', { type: 'image/jpeg' })] }
    });
    await screen.findByText(/Не удалось добавить файлы/);
    expect(dateInput()).toHaveValue(defaultDate);
    expect(screen.getByLabelText('Широта')).toHaveValue('');
    await upload(metadata(laterDate));
    expect(dateInput()).toHaveValue(laterDate);
  });

  it('does not allow a later photo to replace the chosen date after removing the first photo', async () => {
    start();
    await upload(metadata(firstDate));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить снимок 1' }));
    await upload(metadata(laterDate));
    expect(dateInput()).toHaveValue(firstDate);
  });

  it('does not mark an unchanged event dirty solely because the date source changed', async () => {
    const { onClose } = start({ id: 'saved', title: 'Saved event', date: firstDate, photos: [] });
    changeDate(manualDate);
    changeDate(firstDate);
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText('Закрыть без сохранения?')).not.toBeInTheDocument();
  });
});
