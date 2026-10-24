import { ERROR_CODES, SEARCH_MIN_LENGTH, type ErrorCode, type Location } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

/** `language` localises place and country names, so a language switch searches again. */
export function useLocationSearch(query: string, language: string) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    if (debounced.length < SEARCH_MIN_LENGTH) {
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api
      .searchLocations(debounced, { language, signal: controller.signal })
      .then((locations) => {
        setResults(locations);
        setError(null);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err instanceof ApiError ? err.code : ERROR_CODES.INTERNAL);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, language]);

  return { results, loading, error, searchedFor: debounced };
}
