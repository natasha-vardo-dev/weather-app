import { useSyncExternalStore } from 'react';
import { showingSaved, subscribeToSaved } from '../api/savedResponses';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  const unsubscribeSaved = subscribeToSaved(onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
    unsubscribeSaved();
  };
}

/** Why the page may show old data, if it may. */
export type StaleReason = 'offline' | 'server';

/**
 * `offline`: no network at all, or an answer on screen came from the service worker's cache
 * because the network failed (while the browser still reported one). `server`: answers on
 * screen are saved copies because our server failed while the site answered; the user's
 * connection works, so the banner must not tell them to check it.
 */
export function useStaleReason(): StaleReason | null {
  return useSyncExternalStore(subscribe, () => {
    if (!navigator.onLine) return 'offline';
    const saved = showingSaved();
    return saved === 'network' ? 'offline' : saved;
  });
}

/** Whether the page may show old data, for whatever reason. */
export function useOffline(): boolean {
  return useStaleReason() !== null;
}
