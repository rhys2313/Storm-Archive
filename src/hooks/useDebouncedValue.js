import { useEffect, useState } from 'react';

/**
 * Delays propagation of a rapidly changing value.
 * Used for the search box so that filtering and re-rendering the card grid does
 * not run on every keystroke.
 */
export const useDebouncedValue = (value, delay = 250) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return undefined;
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, debounced]);

  return debounced;
};
