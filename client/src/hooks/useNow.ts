import { useEffect, useState } from 'react';

/**
 * The current time, updated every minute. For what depends on the clock (an old forecast, a
 * warning that has started): read during render, `Date.now()` would make the output depend on
 * when React happens to render, and would not change until something else re-rendered.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
