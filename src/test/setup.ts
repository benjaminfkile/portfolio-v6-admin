import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom implements neither matchMedia nor the Storage-change plumbing the theme
// module relies on (§14.4 system-theme detection). Provide a minimal, mutable
// matchMedia so tests can drive `prefers-color-scheme`.
if (!window.matchMedia) {
  let matches = false;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  const mql: MediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) =>
      listeners.add(cb as (e: MediaQueryListEvent) => void),
    removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) =>
      listeners.delete(cb as (e: MediaQueryListEvent) => void),
    addListener: (cb: ((e: MediaQueryListEvent) => void) | null) =>
      listeners.add(cb as (e: MediaQueryListEvent) => void),
    removeListener: (cb: ((e: MediaQueryListEvent) => void) | null) =>
      listeners.delete(cb as (e: MediaQueryListEvent) => void),
    dispatchEvent: () => true,
  };

  window.matchMedia = vi.fn().mockImplementation(() => mql);

  // Test helper: flip the system preference and notify subscribers.
  (window as unknown as { __setPrefersDark: (v: boolean) => void }).__setPrefersDark = (
    value: boolean,
  ) => {
    matches = value;
    listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
  };
}
