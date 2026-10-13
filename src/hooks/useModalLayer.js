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
export const MODALS_CLOSED = 'storm:modals-closed';
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
    let lastFocused = dialogRef.current;
    const handleFocusIn = event => {
      if (layerStack[layerStack.length - 1] !== token) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.contains(event.target)) { lastFocused = event.target; return; }
      const target = lastFocused?.isConnected && dialog.contains(lastFocused) &&
        !lastFocused.matches(':disabled') && !lastFocused.closest('[hidden]') ? lastFocused : dialog;
      target.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', handleFocusIn, true);

    const handleKeyDown = (event) => {
      if (layerStack[layerStack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current?.();
      } else if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex]'
        )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
          !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!first || !dialog.contains(active) || active === dialog ||
          (event.shiftKey ? active === first : active === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
          if (!first) dialog.focus({ preventScroll: true });
        }
      }
    };

    // Capture Escape before Leaflet's keyboard handlers can react underneath.
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      const index = layerStack.indexOf(token);
      if (index >= 0) layerStack.splice(index, 1);
      if (lockScroll && layerStack.length === 0) releaseScrollLock();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
      if (layerStack.length === 0) window.dispatchEvent(new Event(MODALS_CLOSED));
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
