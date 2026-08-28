import { useEffect, useRef } from 'react';

/**
 * Shared behaviour for every overlay in the app.
 *
 * Overlays can nest (the photo lightbox opens on top of the observation
 * dialog), so a module-level stack tracks which one is on top. Escape must only
 * dismiss the topmost layer, and the background scroll lock must survive until
 * the last layer closes.
 */
const layerStack = [];
let lockedScrollY = 0;

const applyScrollLock = () => {
  const { body, documentElement } = document;
  // Compensating for the scrollbar keeps the layout from shifting sideways when
  // it disappears, which is very visible on Windows.
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  lockedScrollY = window.scrollY;
  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
};

const releaseScrollLock = () => {
  const { body } = document;
  body.style.overflow = '';
  body.style.paddingRight = '';
  // Some mobile browsers reset the scroll position when overflow is restored.
  window.scrollTo({ top: lockedScrollY, behavior: 'instant' });
};

export const useModalLayer = (onDismiss, { lockScroll = true } = {}) => {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const dialogRef = useRef(null);

  useEffect(() => {
    const token = {};
    layerStack.push(token);
    if (lockScroll && layerStack.length === 1) applyScrollLock();

    const previouslyFocused = document.activeElement;
    // Focusing the dialog moves the keyboard and screen reader context into the
    // overlay and makes Escape work without clicking first.
    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (layerStack[layerStack.length - 1] !== token) return;
      event.stopPropagation();
      dismissRef.current?.();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const index = layerStack.indexOf(token);
      if (index >= 0) layerStack.splice(index, 1);
      if (lockScroll && layerStack.length === 0) releaseScrollLock();
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [lockScroll]);

  /**
   * Dismisses only when the backdrop itself was clicked. Comparing target with
   * currentTarget is more reliable than stopping propagation on the panel,
   * which also swallows events the panel's own children rely on.
   */
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) dismissRef.current?.();
  };

  return { dialogRef, handleBackdropClick };
};
