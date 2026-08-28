import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';

import App from '../App';
import { __resetStorageForTests, saveEvent } from '../services/storage';

/**
 * End-to-end coverage of the observation lifecycle through the real UI:
 * create, view, edit, restart, delete. These exercise App together with the
 * storage layer, which is where the user-visible regressions live.
 */

const startFresh = () => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  __resetStorageForTests();
};

beforeEach(startFresh);
afterEach(() => vi.restoreAllMocks());

/** Renders the app and waits for the initial load to settle. */
const renderApp = async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await waitForElementToBeRemoved(() => screen.queryByText(/Загрузка архива/i)).catch(() => {});
  return { user, view };
};

const openCreateForm = async (user) => {
  // The empty state and the header both offer a create action; either is fine.
  const trigger = screen.queryByRole('button', { name: /Добавить первое наблюдение/i })
    || screen.getAllByRole('button', { name: /Добавить наблюдение/i })[0];
  await user.click(trigger);
  return screen.getByRole('dialog', { name: /Новое наблюдение/i });
};

const fillTitle = async (user, dialog, title) => {
  await user.clear(within(dialog).getByLabelText(/Название явления/i));
  await user.type(within(dialog).getByLabelText(/Название явления/i), title);
};

const submitForm = async (user) => {
  await user.click(screen.getByRole('button', { name: /Сохранить в архив/i }));
};

const makeImageFile = (name = 'storm.jpg') =>
  new File(['fake-jpeg-bytes'], name, { type: 'image/jpeg' });

describe('empty archive', () => {
  it('greets a new user with the onboarding hero', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { name: /Ваш Storm Archive пуст/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Добавить первое наблюдение/i })).toBeInTheDocument();
  });

  it('does not show the filter bar when there is nothing to filter', async () => {
    await renderApp();
    expect(screen.queryByLabelText(/Поиск по архиву/i)).not.toBeInTheDocument();
  });
});

describe('creating an observation', () => {
  it('saves a record and shows it as a card', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Суперячейка над Бором');
    await user.type(within(dialog).getByLabelText(/Локация/i), 'Нижегородская обл., г. Бор');
    await submitForm(user);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Суперячейка над Бором' })).toBeInTheDocument();
    });
    expect(screen.getByText('Нижегородская обл., г. Бор')).toBeInTheDocument();
    // The onboarding hero must give way to the archive grid.
    expect(screen.queryByRole('heading', { name: /Ваш Storm Archive пуст/i })).not.toBeInTheDocument();
  });

  it('refuses to save without a title and keeps the dialog open', async () => {
    const { user } = await renderApp();
    await openCreateForm(user);

    await submitForm(user);

    expect(await screen.findByText(/Укажите название явления/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Новое наблюдение/i })).toBeInTheDocument();
  });

  it('rejects out-of-range coordinates instead of storing garbage', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Проверка координат');
    await user.type(within(dialog).getByLabelText('Широта'), '150');
    await user.type(within(dialog).getByLabelText('Долгота'), '44');

    expect(await screen.findByText(/Широта должна быть в диапазоне/i)).toBeInTheDocument();

    await submitForm(user);
    expect(screen.getByRole('dialog', { name: /Новое наблюдение/i })).toBeInTheDocument();
  });

  it('requires both coordinates or neither', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Только широта');
    await user.type(within(dialog).getByLabelText('Широта'), '56.3');

    expect(await screen.findByText(/Нужны обе координаты/i)).toBeInTheDocument();
  });

  it('accepts 0,0 as a valid position', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Нулевая точка');
    await user.type(within(dialog).getByLabelText('Широта'), '0');
    await user.type(within(dialog).getByLabelText('Долгота'), '0');

    expect(screen.queryByText(/Нужны обе координаты/i)).not.toBeInTheDocument();
    await submitForm(user);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Нулевая точка' })).toBeInTheDocument();
    });
  });

  it('reveals hail-specific fields only for the hail category', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    expect(within(dialog).queryByLabelText(/Класс града/i)).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/Группа явления/i), 'hail');
    expect(within(dialog).getByLabelText(/Класс града/i)).toBeInTheDocument();
  });

  it('keeps chosen MCS structural features when the subtype changes', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await user.selectOptions(within(dialog).getByLabelText(/Группа явления/i), 'mcs');
    const derecho = within(dialog).getByRole('checkbox', { name: 'Derecho' });
    await user.click(derecho);
    expect(derecho).toBeChecked();

    await user.selectOptions(within(dialog).getByLabelText(/Подтип/i), 'qlcs');
    // Subtype and structural features are independent attributes.
    expect(within(dialog).getByRole('checkbox', { name: 'Derecho' })).toBeChecked();
  });
});

describe('persistence across restarts', () => {
  it('reloads observations from storage after the app is remounted', async () => {
    const { user, view } = await renderApp();
    const dialog = await openCreateForm(user);
    await fillTitle(user, dialog, 'Запись до перезапуска');
    await submitForm(user);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Запись до перезапуска' })).toBeInTheDocument();
    });

    // Simulates closing and reopening the app: fresh React tree, fresh storage
    // connection, same underlying database.
    view.unmount();
    __resetStorageForTests();
    await renderApp();

    expect(await screen.findByRole('button', { name: 'Запись до перезапуска' })).toBeInTheDocument();
  });
});

describe('viewing, editing and deleting', () => {
  const seed = async (overrides = {}) => {
    await saveEvent({
      id: 'evt_seed',
      title: 'Шкваловый ворот',
      date: '2024-07-20T17:45',
      eventType: 'shelf_cloud',
      classification: { category: 'shelf_cloud', subtype: 'unspecified', attributes: {} },
      severity: 'severe',
      location: 'г. Бор',
      latitude: 56.35,
      longitude: 44.07,
      notes: 'Резкое усиление ветра',
      tags: ['шельф'],
      photos: [],
      ...overrides
    });
  };

  it('opens the detail dialog with the stored field values', async () => {
    await seed();
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Шкваловый ворот' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('г. Бор')).toBeInTheDocument();
    expect(within(dialog).getByText('Резкое усиление ветра')).toBeInTheDocument();
    expect(within(dialog).getByText('56.35000, 44.07000')).toBeInTheDocument();
    expect(within(dialog).getByText('#шельф')).toBeInTheDocument();
  });

  it('shows coordinates even when no location name was entered', async () => {
    await seed({ location: '' });
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Шкваловый ворот' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/Координаты/i)).toBeInTheDocument();
    expect(within(dialog).getByText('56.35000, 44.07000')).toBeInTheDocument();
  });

  it('persists an edit and reflects it in the archive', async () => {
    await seed();
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Редактировать' }));

    const form = await screen.findByRole('dialog', { name: /Редактирование наблюдения/i });
    const titleField = within(form).getByLabelText(/Название явления/i);
    await user.clear(titleField);
    await user.type(titleField, 'Шкваловый ворот (уточнено)');
    await user.click(screen.getByRole('button', { name: /Сохранить изменения/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Шкваловый ворот (уточнено)' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Шкваловый ворот' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting and then removes the record', async () => {
    await seed();
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    const confirm = await screen.findByRole('dialog', { name: /Удалить наблюдение\?/i });
    expect(within(confirm).getByText(/Шкваловый ворот/)).toBeInTheDocument();

    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ваш Storm Archive пуст/i })).toBeInTheDocument();
    });
  });

  it('keeps the record when deletion is cancelled', async () => {
    await seed();
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Шкваловый ворот' })).toBeInTheDocument();
  });
});

describe('modal behaviour', () => {
  it('closes a dialog with Escape', async () => {
    const { user } = await renderApp();
    await openCreateForm(user);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Новое наблюдение/i })).not.toBeInTheDocument();
    });
  });

  it('warns before discarding unsaved form input', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);
    await fillTitle(user, dialog, 'Незаконченная запись');

    await user.keyboard('{Escape}');

    expect(await screen.findByText(/несохранённые изменения/i)).toBeInTheDocument();
    // The form is still there behind the confirmation.
    expect(screen.getByRole('dialog', { name: /Новое наблюдение/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Продолжить редактирование/i }));
    expect(screen.getByDisplayValue('Незаконченная запись')).toBeInTheDocument();
  });

  it('restores background scrolling once the last dialog closes', async () => {
    const { user } = await renderApp();
    await openCreateForm(user);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });
});

describe('search and filters', () => {
  const seedMany = async () => {
    await saveEvent({
      id: 'evt_a', title: 'Гроза над рекой', severity: 'low', date: '2024-05-01T12:00',
      classification: { category: 'thunderstorm', subtype: 'unspecified', attributes: {} }, photos: []
    });
    await saveEvent({
      id: 'evt_b', title: 'Крупный град', severity: 'extreme', date: '2024-06-01T12:00',
      classification: { category: 'hail', subtype: 'unspecified', attributes: { hailSizeClass: 'large' } }, photos: []
    });
  };

  it('filters by search query', async () => {
    await seedMany();
    const { user } = await renderApp();

    await user.type(await screen.findByLabelText(/Поиск по архиву/i), 'град');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Гроза над рекой' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Крупный град' })).toBeInTheDocument();
  });

  it('filters by category and offers a reset', async () => {
    await seedMany();
    const { user } = await renderApp();

    await user.selectOptions(await screen.findByLabelText(/Группа явлений/i), 'hail');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Гроза над рекой' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Сбросить/i }));
    expect(await screen.findByRole('button', { name: 'Гроза над рекой' })).toBeInTheDocument();
  });

  it('shows an empty result state that can be cleared', async () => {
    await seedMany();
    const { user } = await renderApp();

    await user.type(await screen.findByLabelText(/Поиск по архиву/i), 'торнадо');

    expect(await screen.findByRole('heading', { name: /Ничего не найдено/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Сбросить фильтры/i }));
    expect(await screen.findByRole('button', { name: 'Гроза над рекой' })).toBeInTheDocument();
  });
});

describe('photos', () => {
  it('attaches a photo, keeps it after save and shows it in the detail view', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Запись со снимком');
    await user.upload(within(dialog).getByLabelText(/Выбрать снимки/i), makeImageFile());

    await waitFor(() => {
      expect(within(dialog).getByText(/Снимков в записи/i)).toBeInTheDocument();
    });

    await submitForm(user);

    const card = await screen.findByRole('button', { name: 'Запись со снимком' });
    expect(card).toBeInTheDocument();

    await user.click(card);
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText(/Фотографии наблюдения \(1\)/i)).toBeInTheDocument();
  });

  it('supports several photos in one record and removing just one', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);

    await fillTitle(user, dialog, 'Серия снимков');
    await user.upload(
      within(dialog).getByLabelText(/Выбрать снимки/i),
      [makeImageFile('a.jpg'), makeImageFile('b.jpg'), makeImageFile('c.jpg')]
    );

    await waitFor(() => {
      expect(within(dialog).getByText('3')).toBeInTheDocument();
    });

    await user.click(within(dialog).getByRole('button', { name: /Удалить снимок 2/i }));
    await waitFor(() => {
      expect(within(dialog).getByText('2')).toBeInTheDocument();
    });

    await submitForm(user);

    await user.click(await screen.findByRole('button', { name: 'Серия снимков' }));
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText(/Фотографии наблюдения \(2\)/i)).toBeInTheDocument();
  });

  it('closing the lightbox does not also close the observation dialog', async () => {
    const { user } = await renderApp();
    const form = await openCreateForm(user);
    await fillTitle(user, form, 'Проверка лайтбокса');
    await user.upload(within(form).getByLabelText(/Выбрать снимки/i), makeImageFile());
    await waitFor(() => expect(within(form).getByText(/Снимков в записи/i)).toBeInTheDocument());
    await submitForm(user);

    await user.click(await screen.findByRole('button', { name: 'Проверка лайтбокса' }));
    const detail = await screen.findByRole('dialog', { name: /Проверка лайтбокса/i });

    await user.click(within(detail).getByRole('button', { name: /Открыть снимок 1 из 1/i }));
    expect(await screen.findByRole('dialog', { name: /Просмотр фотографии 1 из 1/i })).toBeInTheDocument();

    // Escape must dismiss only the topmost layer.
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Просмотр фотографии/i })).not.toBeInTheDocument();
    });
    // The observation dialog is still open underneath.
    expect(within(screen.getByRole('dialog', { name: /Проверка лайтбокса/i })).getByText(/Фотографии наблюдения/i)).toBeInTheDocument();
  });

  it('lists photos from every observation in the gallery tab', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);
    await fillTitle(user, dialog, 'Кадр для галереи');
    await user.upload(within(dialog).getByLabelText(/Выбрать снимки/i), makeImageFile());
    await waitFor(() => expect(within(dialog).getByText(/Снимков в записи/i)).toBeInTheDocument());
    await submitForm(user);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Кадр для галереи' })).toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: /Галерея/i })[0]);

    expect(await screen.findByText(/Всего снимков в архиве/i)).toBeInTheDocument();
    expect(screen.getByText('Кадр для галереи')).toBeInTheDocument();
  });
});

describe('tabs', () => {
  it('shows an empty gallery message when nothing has photos', async () => {
    await saveEvent({ id: 'evt_np', title: 'Без фото', photos: [] });
    const { user } = await renderApp();

    await user.click(screen.getAllByRole('button', { name: /Галерея/i })[0]);
    expect(await screen.findByRole('heading', { name: /Галерея пуста/i })).toBeInTheDocument();
  });

  it('renders statistics for the stored observations', async () => {
    await saveEvent({
      id: 'evt_s1', title: 'Опасная гроза', severity: 'extreme', date: '2024-06-15T18:00',
      classification: { category: 'thunderstorm', subtype: 'unspecified', attributes: {} }, photos: []
    });
    const { user } = await renderApp();

    await user.click(screen.getAllByRole('button', { name: /Статистика/i })[0]);

    expect(await screen.findByText(/Всего наблюдений/i)).toBeInTheDocument();
    expect(screen.getByText(/Сезонное распределение/i)).toBeInTheDocument();
  });

  it('offers the empty-state call to action on the stats tab', async () => {
    const { user } = await renderApp();
    await user.click(screen.getAllByRole('button', { name: /Статистика/i })[0]);
    expect(await screen.findByRole('heading', { name: /Статистика пока недоступна/i })).toBeInTheDocument();
  });
});

describe('StrictMode', () => {
  /**
   * main.jsx renders the app inside StrictMode, which double-invokes effects in
   * development: every effect is mounted, cleaned up and mounted again. Guards
   * such as an "is mounted" ref must survive that, otherwise async results are
   * dropped after the first cleanup. These cases run the real StrictMode tree.
   */
  const renderStrict = async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await waitForElementToBeRemoved(() => screen.queryByText(/Загрузка архива/i)).catch(() => {});
    return user;
  };

  it('still attaches photos when effects are double-invoked', async () => {
    const user = await renderStrict();
    await user.click(screen.getByRole('button', { name: /Добавить первое наблюдение/i }));
    const dialog = await screen.findByRole('dialog', { name: /Новое наблюдение/i });

    await user.type(within(dialog).getByLabelText(/Название явления/i), 'Фото в StrictMode');
    await user.upload(within(dialog).getByLabelText(/Выбрать снимки/i), makeImageFile());

    // The progress indicator must clear and the photo must be committed.
    await waitFor(() => {
      expect(within(dialog).getByText(/Снимков в записи/i)).toBeInTheDocument();
    });
    expect(within(dialog).queryByText(/Обработка снимков/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Сохранить в архив/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Фото в StrictMode' })).toBeInTheDocument();
    });
  });

  it('still reports the storage backend in the backup dialog', async () => {
    const user = await renderStrict();
    await user.click(screen.getByRole('button', { name: /Данные и резервные копии/i }));

    // Would stay on "определяется…" if the mount guard were not re-armed.
    expect(await screen.findByText(/IndexedDB/i)).toBeInTheDocument();
  });
});

describe('failure handling', () => {
  it('keeps the user input on screen when saving fails', async () => {
    const { user } = await renderApp();
    const dialog = await openCreateForm(user);
    await fillTitle(user, dialog, 'Не сохранится');

    // Simulates a full storage quota at the moment of writing.
    const failure = new Error('Хранилище переполнено');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw failure; });

    await submitForm(user);

    expect(await screen.findByText(/Хранилище переполнено/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Не сохранится')).toBeInTheDocument();
  });
});
