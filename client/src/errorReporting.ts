/**
 * Errors from this browser go to the server's log (POST /api/v1/client-errors): a render that
 * failed (React, through the ErrorBoundary or with nothing to catch it), and errors and
 * promise rejections nothing caught. Without it nobody would know the page broke for someone.
 * Our own endpoint, not an error-tracking service: nothing leaves our hosts.
 *
 * Careful with what it sends: the page with places replaced by a placeholder (a link to a
 * place without an id holds its coordinates), no query, nothing from storage.
 */

import { API_PREFIX } from '@weather/shared';

export type ClientErrorKind = 'render' | 'error' | 'rejection';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  componentStack?: string;
  path: string;
  release?: string;
}

/** The build, set by Vite from the commit Vercel builds (vite.config.ts), "dev" locally. */
declare const __RELEASE__: string;

/** A page in trouble may fail on every render: a few reports tell what broke. */
const MAX_REPORTS = 5;

/** Noise the browser or its extensions make, not our bugs. */
const IGNORED = [/ResizeObserver loop/, /chrome-extension:\/\//, /moz-extension:\/\//, /safari-web-extension:\/\//];

/** The page without what identifies a place: /weather/52.23,21.01 → /weather/:place. */
export function reportPath(pathname: string): string {
  return pathname.replace(/^\/weather\/[^/]+/, '/weather/:place').slice(0, 200);
}

export function createErrorReporter(options: {
  send: (report: ClientErrorReport) => void;
  path: () => string;
  release?: string;
  max?: number;
}) {
  const { send, path, release, max = MAX_REPORTS } = options;
  const seen = new Set<string>();
  return (kind: ClientErrorKind, error: unknown, componentStack?: string): void => {
    const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500);
    const stack = error instanceof Error ? error.stack?.slice(0, 4000) : undefined;
    if (IGNORED.some((pattern) => pattern.test(message) || (stack && pattern.test(stack)))) return;
    // The same error again (each render, each retry) adds nothing.
    if (seen.has(message) || seen.size >= max) return;
    seen.add(message);
    send({
      kind,
      message,
      ...(stack ? { stack } : {}),
      ...(componentStack ? { componentStack: componentStack.slice(0, 2000) } : {}),
      path: reportPath(path()),
      ...(release ? { release } : {}),
    });
  };
}

/** Sends a report; never throws (a report failing must not add an error of its own). */
function post(report: ClientErrorReport): void {
  try {
    void fetch(`${API_PREFIX}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      // Still sent when the page is closed or reloaded right after (the "Reload" button).
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing to do: there is nowhere left to report to.
  }
}

/** The app's reporter; quiet in unit tests (they run the components without a server). */
export const reportError = createErrorReporter({
  send: import.meta.env.MODE === 'test' ? () => {} : post,
  path: () => window.location.pathname,
  release: typeof __RELEASE__ === 'string' ? __RELEASE__ : undefined,
});

/** Errors and promise rejections nothing caught, from anywhere on the page. */
export function reportUncaughtErrors(): void {
  window.addEventListener('error', (event) => reportError('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError('rejection', event.reason));
}
