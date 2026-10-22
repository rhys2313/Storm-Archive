import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTheme, THEME_KEY } from '../hooks/useTheme';
import SettingsModal from '../components/SettingsModal';

let dark, listeners;
function Appearance() {
  const state = useTheme();
  return (
    <>
      <output aria-label="Текущая тема">{state.theme}</output>
      <SettingsModal
        preference={state.preference}
        onThemeChange={state.chooseTheme}
        saveError={state.saveError}
        onClose={() => {}}
        onOpenBackup={() => {}}
      />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  dark = false;
  listeners = new Set();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn)
    }))
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('follows system appearance and responds to a change without rewriting the archive', () => {
  localStorage.setItem('storm_archive_v3', 'original archive bytes');
  render(<Appearance />);
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  expect(
    screen.getByRole('radio', { name: /Как на устройстве/ })
  ).toBeChecked();
  act(() => {
    dark = true;
    listeners.forEach((fn) => fn());
  });
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(localStorage.getItem('storm_archive_v3')).toBe(
    'original archive bytes'
  );
});

it('persists an explicit selection and ignores system changes until system is chosen', () => {
  render(<Appearance />);
  fireEvent.click(screen.getByRole('radio', { name: /^Тёмная/ }));
  expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  act(() => listeners.forEach((fn) => fn()));
  expect(screen.getByLabelText('Текущая тема')).toHaveTextContent('dark');
  fireEvent.click(screen.getByRole('radio', { name: /Как на устройстве/ }));
  expect(screen.getByLabelText('Текущая тема')).toHaveTextContent('light');
});

it('restores a saved selection after remount', () => {
  localStorage.setItem(THEME_KEY, 'dark');
  const view = render(<Appearance />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('radio', { name: /^Светлая/ }));
  view.unmount();
  render(<Appearance />);
  expect(screen.getByRole('radio', { name: /^Светлая/ })).toBeChecked();
});

it('uses system appearance for an unknown saved preference', () => {
  localStorage.setItem(THEME_KEY, 'unknown');
  dark = true;
  render(<Appearance />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(
    screen.getByRole('radio', { name: /Как на устройстве/ })
  ).toBeChecked();
});

it('keeps appearance usable and explains a preference write failure', async () => {
  render(<Appearance />);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  fireEvent.click(screen.getByRole('radio', { name: /^Тёмная/ }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  await waitFor(() =>
    expect(screen.getByText(/Не удалось сохранить выбор/)).toHaveAttribute(
      'role',
      'status'
    )
  );
});

it('synchronizes preferences from another window and removes listeners on unmount', () => {
  const view = render(<Appearance />);
  localStorage.setItem(THEME_KEY, 'dark');
  fireEvent(
    window,
    new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' })
  );
  expect(document.documentElement.dataset.theme).toBe('dark');
  view.unmount();
  expect(listeners.size).toBe(0);
});
