import { ERROR_CODES, SEARCH_MIN_LENGTH, type ErrorCode, type Location } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

const NONE: Location[] = [];

interface Answer {
  /** The search it answers: language and query. */
  key: string;
  results: Location[];
  error: ErrorCode | null;
}

/**
 * `language` localises place and country names, so a language switch searches again.
 *
 * Only the last answer is state; the rest is worked out from it during render: a query too
 * short shows nothing, and the search is loading until the answer is for the current query.
 * (Clearing and flagging in the effect rendered every change twice.) While a new query loads,
 * the previous results and error stay, as before; a query too short drops them.
 */
export function useLocationSearch(query: string, language: string) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const tooShort = debounced.length < SEARCH_MIN_LENGTH;
  const key = `${language}:${debounced}`;
  // A query too short drops the answer, not just hides it: otherwise, after choosing a city
  // (the query becomes ''), the next search showed the old list while loading, with its old
  // highlighted row, and Enter opened the previous city. (Found by roborev.)
  if (tooShort && answer) setAnswer(null);

  useEffect(() => {
    if (tooShort) return;
    const controller = new AbortController();
    api
      .searchLocations(debounced, { language, signal: controller.signal })
      .then((results) => setAnswer({ key, results, error: null }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        const error = err instanceof ApiError ? err.code : ERROR_CODES.INTERNAL;
        setAnswer((previous) => ({ key, results: previous?.results ?? NONE, error }));
      });
    return () => controller.abort();
  }, [debounced, language, key, tooShort]);

  return {
    results: tooShort ? NONE : (answer?.results ?? NONE),
    loading: !tooShort && answer?.key !== key,
    error: tooShort ? null : (answer?.error ?? null),
    searchedFor: debounced,
  };
}
