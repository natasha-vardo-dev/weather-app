import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { takePendingOpen, tracePage } from '../push/pendingOpen';

/**
 * Opens the place a tapped warning notification is about, by two routes:
 * - the service worker asks this page (`open-place` message, public/push-sw.js): it opens the
 *   place with the app's router (no reload) and answers on the message's port, so the worker
 *   does not navigate the window itself or open another;
 * - the worker also records the place (`takePendingOpen`), and the page opens it when it loads
 *   or shows again: an iPhone brought a running app forward without either reaching it.
 * The record is removed when used either way, so coming back later never jumps to it again.
 * A page already at the place stays as it is: navigating to it again would add a second history
 * entry, and Back would seem to do nothing. (Found by roborev.)
 */

/** The worker records the place alongside opening the window: checked again a moment later. */
const RECHECK_MS = 1000;
export function useOpenFromNotification(): void {
  const navigate = useNavigate();
  const location = useLocation();
  // The page shown now and the router's navigate, read by the listeners below: the effect runs
  // once. navigate() changes with every pathname under BrowserRouter, and as a dependency it
  // subscribed everything again, and read IndexedDB twice, on every move; a record taken just
  // then was dropped by the cleanup and the place never opened. (Found by roborev.)
  const shown = useRef('');
  const go = useRef(navigate);
  useEffect(() => {
    shown.current = location.pathname + location.search;
    go.current = navigate;
  }, [location, navigate]);
  useEffect(() => {
    const here = () => shown.current;
    const navigate = (path: string) => go.current(path);
    let cancelled = false;
    let recheck: ReturnType<typeof setTimeout> | undefined;
    function openPending() {
      void takePendingOpen().then((path) => {
        if (path) void tracePage('page: took the record', { path, alreadyThere: path === here(), cancelled });
        if (path && !cancelled && path !== here()) navigate(path);
      });
    }
    function onShown() {
      openPending();
      clearTimeout(recheck);
      recheck = setTimeout(openPending, RECHECK_MS);
    }
    // TEMPORARY trace of the page showing again: only where notifications are allowed, and
    // without the page, so it is no history of places viewed; after the record's own check, so
    // it does not delay it. (Found by roborev.)
    const traceShown = (event: string) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        void tracePage(event, { state: document.visibilityState });
      }
    };
    function onVisible() {
      if (document.visibilityState === 'visible') onShown();
      traceShown('page: visibility');
    }
    function onPageShow() {
      onShown();
      traceShown('page: pageshow');
    }
    onShown();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);

    const container = navigator.serviceWorker;
    function onMessage(event: MessageEvent) {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'open-place') return;
      const path = (data as { path?: unknown }).path;
      // A path of this site only: a message is input like any other.
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return;
      void tracePage('page: message', { path, alreadyThere: path === here() });
      if (path !== here()) navigate(path);
      event.ports[0]?.postMessage('opened');
      // Used: the record must not open it again later.
      void takePendingOpen();
    }
    container?.addEventListener('message', onMessage);
    // Messages wait in a queue until the page says it listens.
    container?.startMessages();
    return () => {
      cancelled = true;
      clearTimeout(recheck);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      container?.removeEventListener('message', onMessage);
    };
  }, []);
}
