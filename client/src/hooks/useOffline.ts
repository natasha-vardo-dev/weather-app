import { useSyncExternalStore } from 'react';
import { isShowingSaved, subscribeToSaved } from '../api/savedResponses';

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

/**
 * Whether the page may show old data: no network at all, or the last API answer came from
 * the service worker's cache (the network failed while the browser still reported one).
 */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, () => !navigator.onLine || isShowingSaved());
}
