/**
 * Whether the screen shows API data the service worker saved earlier.
 *
 * The service worker answers from its cache whenever the network fails, and that happens
 * with `navigator.onLine` still true: Wi-Fi without internet (a hotel login page), a weak
 * signal. It marks such answers with a header (vite.config.ts); the API client remembers
 * which parsed values came from them (`markSavedValue`), and the hooks that put data on
 * screen report those values while they are shown (`useReportSaved`).
 *
 * Tied to what is on screen, not to the last response: requests run in parallel
 * (forecast, air quality, a forecast per saved city), so a fresh answer for one must not
 * hide that another is still old, and an old answer no longer shown must not keep the
 * warning up.
 */
export const SAVED_RESPONSE_HEADER = 'X-From-Cache';

/** Parsed bodies of saved answers. Weak: a value nobody holds is forgotten. */
const savedValues = new WeakSet<object>();

/** How many mounted components show a saved value right now. */
let shown = 0;
const listeners = new Set<() => void>();

/**
 * For the API client's fetch: a saved answer's parsed body is remembered, so the value
 * itself says where it came from wherever it travels (caches, state, props).
 */
export function markSavedResponse(response: Response): Response {
  if (!response.headers.has(SAVED_RESPONSE_HEADER)) return response;
  const parse = response.json.bind(response);
  response.json = async () => {
    const value: unknown = await parse();
    if (typeof value === 'object' && value !== null) savedValues.add(value);
    return value;
  };
  return response;
}

/** For values taken out of a saved answer (one forecast of a batch): they are saved too. */
export function markSavedValue(value: object): void {
  savedValues.add(value);
}

export function isSavedValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null && savedValues.has(value);
}

/** Counts one more saved value on screen; call the result when it is gone. */
export function showSaved(): () => void {
  shown += 1;
  if (shown === 1) listeners.forEach((listener) => listener());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    shown -= 1;
    if (shown === 0) listeners.forEach((listener) => listener());
  };
}

export function isShowingSaved(): boolean {
  return shown > 0;
}

export function subscribeToSaved(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
