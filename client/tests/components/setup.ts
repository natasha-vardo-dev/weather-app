import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Runs for every test file; only component tests (jsdom) have a DOM.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;

if (dom) {
  // Node 25+ has its own localStorage global (undefined without --localstorage-file), and it
  // wins over jsdom's: point both storages back at jsdom.
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  // jsdom has no media queries: a desktop browser, not installed, no reduced motion.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(async () => {
  if (!dom) return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
