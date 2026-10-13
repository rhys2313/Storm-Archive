import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { MODALS_CLOSED } from './useModalLayer';

const hashes = { events: 'archive', map: 'map', gallery: 'gallery', stats: 'stats' };
const fromLocation = () => Object.keys(hashes).find(key => hashes[key] === window.location.hash.slice(1)) || 'events';

export function useSectionNavigation() {
  const [activeTab, setActiveTab] = useState(fromLocation);
  const current = useRef(activeTab);
  const positions = useRef({});
  const mainRef = useRef(null);
  const focusSection = useRef(false);
  const pending = useRef(false);
  const restoreSection = useCallback(() => {
    // Browser Back may change the section behind an unsaved form. Let the
    // modal finish restoring its own scroll/focus before restoring the section.
    if (document.querySelector('[role="dialog"]')) { pending.current = true; return; }
    pending.current = false;
    window.scrollTo({ top: positions.current[current.current] || 0, behavior: 'instant' });
    if (focusSection.current) mainRef.current?.focus({ preventScroll: true });
    focusSection.current = false;
  }, []);

  const select = useCallback((next, push = true) => {
    if (!hashes[next] || current.current === next) return;
    if (!focusSection.current) positions.current[current.current] = window.scrollY;
    current.current = next;
    focusSection.current = true;
    if (push) window.history.pushState(null, '', `#${hashes[next]}`);
    setActiveTab(next);
  }, []);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const restore = () => select(fromLocation(), false);
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    let frame;
    const afterDialogs = () => { if (pending.current) frame = requestAnimationFrame(restoreSection); };
    window.addEventListener(MODALS_CLOSED, afterDialogs);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
      window.removeEventListener(MODALS_CLOSED, afterDialogs);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [select, restoreSection]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(restoreSection);
    return () => cancelAnimationFrame(frame);
  }, [activeTab, restoreSection]);

  return { activeTab, setActiveTab: select, mainRef };
}
