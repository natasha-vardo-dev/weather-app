/**
 * Runs actions one at a time, keeping only the latest that arrives while one runs: quick
 * clicks through the bell's options each start a change that takes a second or two (token,
 * then leaving and joining topics), and they must end on the last option chosen. Plain
 * function, tested without React.
 */
export function latestOnly(handlers: {
  /** The first action of a run starts. */
  onStart: () => void;
  /** All done; `failure` is the last action's error, or null if it succeeded. */
  onIdle: (failure: unknown) => void;
}) {
  let queued: (() => Promise<void>) | null = null;
  let running = false;

  return function run(action: () => Promise<void>): void {
    queued = action;
    if (running) return;
    running = true;
    handlers.onStart();
    void (async () => {
      let failure: unknown = null;
      while (queued) {
        const next = queued;
        queued = null;
        try {
          await next();
          failure = null;
        } catch (err) {
          failure = err;
        }
      }
      running = false;
      handlers.onIdle(failure);
    })();
  };
}
