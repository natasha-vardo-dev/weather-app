import type { Server } from 'node:http';
import type { Logger } from './observability/logger.js';

export interface ShutdownOptions {
  logger: Logger;
  /** How long requests under way may take to finish (Render kills the process after 30 s). */
  timeoutMs?: number;
  /** Called first: the app starts answering health checks with 503 and closing connections. */
  onStart?: () => void;
  exit?: (code: number) => void;
}

/**
 * Stops the server the way a deploy needs it (SIGTERM, then SIGKILL 30 s later on Render):
 * no new connections, requests under way finish, idle keep-alive connections close at once,
 * and whatever is still open after `timeoutMs` is cut. Before, the process just died and the
 * answers it was preparing were lost.
 *
 * Returns the handler; repeated signals do nothing more.
 */
export function gracefulShutdown(server: Server, options: ShutdownOptions): (signal: string) => void {
  const { logger, timeoutMs = 10_000, onStart, exit = (code) => process.exit(code) } = options;
  let started = false;
  return (signal) => {
    if (started) return;
    started = true;
    onStart?.();
    logger.info({ signal }, 'shutting down: finishing requests under way');
    const deadline = setTimeout(() => {
      logger.warn({ timeoutMs }, 'requests still open at shutdown, closing them');
      server.closeAllConnections();
    }, timeoutMs);
    deadline.unref();
    // A keep-alive connection whose last request just finished becomes idle and would hold
    // close() until it times out (5 s by default): close idle ones as they appear.
    const sweep = setInterval(() => server.closeIdleConnections(), 100);
    sweep.unref();
    server.close((err) => {
      clearTimeout(deadline);
      clearInterval(sweep);
      if (err) logger.error({ err }, 'shutdown failed');
      else logger.info('stopped');
      exit(err ? 1 : 0);
    });
    server.closeIdleConnections();
  };
}
