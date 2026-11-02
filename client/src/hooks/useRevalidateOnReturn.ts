import { useEffect, useState } from 'react';

/**
 * A number that goes up when the page comes back into view (another tab, an app switched back
 * to, a phone woken up: an installed app is often resumed, not reloaded) or the connection
 * returns with the page in view, and `isDue(key)` says the data shown for `key` is old enough
 * to ask again. A data hook lists it in its loading effect's dependencies, so it loads again
 * while the old data stays on screen.
 *
 * No timer: a page left in view is not refreshed, so a forgotten tab does not keep spending the
 * provider's daily quota on its place (see "Frontend" in docs/architecture.md).
 * `isDue` must be stable (a module-level function).
 */
export function useRevalidateOnReturn(key: string | null, isDue: (key: string) => boolean): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (key === null) return;
    const shownKey = key;
    // Offline the `online` event asks instead: a request now would only fail.
    function check() {
      if (document.visibilityState === 'visible' && navigator.onLine && isDue(shownKey)) setRevision((n) => n + 1);
    }
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, [key, isDue]);
  return revision;
}
