import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import PwaStatus from '../components/PwaStatus';
import StatsView from '../components/StatsView';
import EventDetailModal from '../components/EventDetailModal';

const snapshot = vi.hoisted(() => ({ value: null }));
vi.mock('../services/pwa', () => ({
  pwa: {
    subscribe: () => () => {},
    getSnapshot: () => snapshot.value,
    applyUpdate: vi.fn(),
    retry: vi.fn()
  }
}));

beforeEach(() => {
  snapshot.value = { phase: 'ready', updateReady: false, message: '' };
});

function StatusSlots({ blocked = false }) {
  return (
    <>
      <PwaStatus blocked={blocked} />
      <PwaStatus compact />
    </>
  );
}

it('shows successful offline readiness once, as a named compact indicator', () => {
  render(<StatusSlots />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(
    screen.getByRole('status', {
      name: 'Приложение готово к работе без интернета.'
    })
  ).toBeVisible();
  expect(document.querySelector('.pwa-install-banner')).toBeNull();
});

it('keeps update offers and their blocked state visible in the notice area', () => {
  snapshot.value = { ...snapshot.value, updateReady: true };
  render(<StatusSlots blocked />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByText(/Доступна новая версия/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Обновить приложение' })
  ).toBeDisabled();
  expect(document.querySelector('.pwa-status-ready')).toBeNull();
});

it('keeps preparation failures and retry visible instead of the success indicator', () => {
  snapshot.value = { ...snapshot.value, phase: 'error' };
  render(<StatusSlots />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByText(/Не удалось подготовить/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Повторить подготовку' })
  ).toBeVisible();
});

it('does not collapse a ready state that still has a service warning', () => {
  snapshot.value = {
    ...snapshot.value,
    message: 'Не удалось проверить обновление.'
  };
  render(<StatusSlots />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByText(snapshot.value.message)).toBeVisible();
  expect(document.querySelector('.pwa-status-ready')).toBeNull();
});

it('does not draw a seasonal chart for an archive whose dates are all unknown', () => {
  render(
    <StatsView
      events={[{ id: 'undated', title: 'Без даты', date: '', photos: [] }]}
    />
  );
  expect(
    screen.queryByRole('img', { name: /Количество наблюдений по месяцам/ })
  ).toBeNull();
  expect(screen.getByText(/Добавьте дату к наблюдениям/)).toBeVisible();
  expect(screen.getByText(/Без даты: 1/)).toBeVisible();
});

it('labels zero months explicitly and counts only real dated observations', () => {
  const events = [
    { id: 'dated', date: '2020-06-20T18:30', photos: [] },
    { id: 'unknown', date: '', photos: [] }
  ];
  render(<StatsView events={events} />);
  const chart = screen.getByRole('img', {
    name: /Количество наблюдений по месяцам/
  });
  expect(chart).toHaveAttribute(
    'aria-label',
    expect.stringContaining('Янв — 0')
  );
  expect(chart).toHaveAttribute(
    'aria-label',
    expect.stringContaining('Июн — 1')
  );
  expect(
    [...chart.querySelectorAll('.month-count')].map((node) => node.textContent)
  ).toEqual(['0', '0', '0', '0', '0', '1', '0', '0', '0', '0', '0', '0']);
});

it('puts observation photographs before potentially long field notes without removing either', () => {
  render(
    <EventDetailModal
      event={{
        id: 'detail',
        title: 'Снимок и заметки',
        photos: [{ id: 'photo', url: 'data:image/jpeg;base64,Yg==' }],
        notes: 'Подробные полевые заметки'
      }}
      onClose={() => {}}
    />
  );
  const photo = screen.getByRole('button', { name: 'Открыть снимок 1 из 1' });
  const notes = screen.getByText('Подробные полевые заметки');
  expect(
    photo.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});

it('does not round a rare nonzero month down to an invisible zero bar', () => {
  render(
    <StatsView
      events={[
        ...Array.from({ length: 1000 }, (_, id) => ({
          id,
          date: '2020-06-20T18:30',
          photos: []
        })),
        { id: 'rare', date: '2020-01-20T18:30', photos: [] }
      ]}
    />
  );
  const rare = document.querySelector(
    '.month-column[title="Янв: 1"] .month-bar-fill'
  );
  expect(parseFloat(rare.style.height)).toBeGreaterThan(0);
});
