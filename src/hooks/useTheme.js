import { useEffect, useLayoutEffect, useState } from 'react';

export const THEME_KEY = 'storm_archive_theme';
const valid = (value) => ['system', 'light', 'dark'].includes(value);
const readPreference = () => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return valid(value) ? value : 'system';
  } catch {
    return 'system';
  }
};
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function useTheme() {
  const [preference, setPreference] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => Boolean(media()?.matches));
  const [saveError, setSaveError] = useState('');
  const theme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useLayoutEffect(() => {
    document.documentElement.classList.add('theme-changing');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor =
      theme === 'dark' ? '#101112' : '#f2f3f1';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#101112' : '#f2f3f1');
    let secondFrame;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() =>
        document.documentElement.classList.remove('theme-changing')
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      document.documentElement.classList.remove('theme-changing');
    };
  }, [theme]);
  useEffect(() => {
    const query = media();
    const update = () => setSystemDark(Boolean(query?.matches));
    query?.addEventListener?.('change', update);
    const sync = (event) => {
      if (event.key === THEME_KEY || event.key === null)
        setPreference(readPreference());
    };
    window.addEventListener('storage', sync);
    return () => {
      query?.removeEventListener?.('change', update);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const chooseTheme = (value) => {
    if (!valid(value)) return;
    setPreference(value);
    try {
      localStorage.setItem(THEME_KEY, value);
      setSaveError('');
    } catch {
      setSaveError(
        'Не удалось сохранить выбор. Тема действует до закрытия приложения.'
      );
    }
  };
  return { theme, preference, chooseTheme, saveError };
}
