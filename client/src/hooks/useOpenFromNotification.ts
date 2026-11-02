import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/**
 * Opens the place a tapped warning notification is about, when the service worker asks this
 * page to (public/push-sw.js, `open-place`), with the app's router: no reload. It answers on the
 * message's port, so the worker knows not to navigate the window itself or open another.
 */
export function useOpenFromNotification(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;
    function onMessage(event: MessageEvent) {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'open-place') return;
      const path = (data as { path?: unknown }).path;
      // A path of this site only: a message is input like any other.
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return;
      navigate(path);
      event.ports[0]?.postMessage('opened');
    }
    container.addEventListener('message', onMessage);
    // Messages wait in a queue until the page says it listens.
    container.startMessages();
    return () => container.removeEventListener('message', onMessage);
  }, [navigate]);
}
