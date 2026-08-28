import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import 'fake-indexeddb/auto';

afterEach(() => cleanup());

// jsdom does not implement these, but the app relies on them for photos and
// for the online/offline indicator.
if (!globalThis.navigator || typeof globalThis.navigator.onLine !== 'boolean') {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true });
}

// jsdom has no layout, so scrolling is a no-op. The modal scroll lock calls it.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}

if (typeof globalThis.createImageBitmap !== 'function') {
  globalThis.createImageBitmap = async () => {
    throw new Error('createImageBitmap is not available in jsdom');
  };
}

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
}

// jsdom parses <img> but never loads it, so neither onload nor onerror ever
// fires and any code awaiting a decode would stall. Settling as a load error
// keeps the image-processing fallbacks under test.
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true,
  set(value) {
    this.setAttribute('src', value);
    if (!value) return;
    queueMicrotask(() => this.dispatchEvent(new Event('error')));
  },
  get() {
    return this.getAttribute('src') || '';
  }
});
