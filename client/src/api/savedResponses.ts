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
 *
 * Each saved value also says why it was used: `network` (the request failed or timed out) or
 * `server` (the site answered, the API behind it did not: the header's value is `server`). The
 * banner tells the user they are offline only in the first case.
 */
export const SAVED_RESPONSE_HEADER = 'X-From-Cache';

export type SavedReason = 'network' | 'server';

/** Parsed bodies of saved answers, and why. Weak: a value nobody holds is forgotten. */
const savedValues = new WeakMap<object, SavedReason>();

/** How many mounted components show a saved value right now, by reason. */
const shown: Record<SavedReason, number> = { network: 0, server: 0 };
const listeners = new Set<() => void>();

/**
 * For the API client's fetch: a saved answer's parsed body is remembered, so the value
 * itself says where it came from wherever it travels (caches, state, props).
 */
export function markSavedResponse(response: Response): Response {
  const mark = response.headers.get(SAVED_RESPONSE_HEADER);
  if (mark === null) return response;
  const reason: SavedReason = mark === 'server' ? 'server' : 'network';
  const parse = response.json.bind(response);
  response.json = async () => {
    const value: unknown = await parse();
    if (typeof value === 'object' && value !== null) savedValues.set(value, reason);
    return value;
  };
  return response;
}

/** For values taken out of a saved answer (one forecast of a batch): saved too, for the same reason. */
export function markSavedValue(value: object, reason: SavedReason = 'network'): void {
  savedValues.set(value, reason);
}

/** Why a value on screen is a saved one, or undefined for a fresh one. */
export function savedReason(value: unknown): SavedReason | undefined {
  return typeof value === 'object' && value !== null ? savedValues.get(value) : undefined;
}

export function isSavedValue(value: unknown): boolean {
  return savedReason(value) !== undefined;
}

/** Counts one more saved value on screen; call the result when it is gone. */
export function showSaved(reason: SavedReason = 'network'): () => void {
  const before = showingSaved();
  shown[reason] += 1;
  if (showingSaved() !== before) listeners.forEach((listener) => listener());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const was = showingSaved();
    shown[reason] -= 1;
    if (showingSaved() !== was) listeners.forEach((listener) => listener());
  };
}

/**
 * Why the screen shows saved data, if it does: `network` when any of it is there because the
 * network failed (then the user may be offline), else `server`.
 */
export function showingSaved(): SavedReason | null {
  return shown.network > 0 ? 'network' : shown.server > 0 ? 'server' : null;
}

export function isShowingSaved(): boolean {
  return showingSaved() !== null;
}

export function subscribeToSaved(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
