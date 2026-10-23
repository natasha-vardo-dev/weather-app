import { SEARCH_MIN_LENGTH, type Location } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

export function useLocationSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debounced.length < SEARCH_MIN_LENGTH) {
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api
      .searchLocations(debounced, controller.signal)
      .then((locations) => {
        setResults(locations);
        setError(null);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced]);

  return { results, loading, error, searchedFor: debounced };
}
