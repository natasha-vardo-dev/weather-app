import {
  isFavorite as isSaved,
  MAX_FAVORITES,
  parseFavorites,
  toggleFavorite,
  type Favorite,
} from '@weather/shared';
import { useCallback, useSyncExternalStore } from 'react';

/** Versioned key: a future format can migrate from v1 instead of misreading it. */
const STORAGE_KEY = 'favorites:v1';

const listeners = new Set<() => void>();
let cache: { raw: string | null; favorites: Favorite[] } = { raw: null, favorites: [] };

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage blocked (privacy mode): behave as an empty list.
  }
}

/** Same array while storage is unchanged: useSyncExternalStore needs a stable snapshot. */
function getSnapshot(): Favorite[] {
  const raw = readRaw();
  if (raw !== cache.raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      // Corrupted value: treat as empty rather than crash the page.
    }
    cache = { raw, favorites: parseFavorites(parsed) };
  }
  return cache.favorites;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Fires when another tab changes storage, so every open tab stays in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(favorites: Favorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Not saved (storage full or blocked); nothing else to do in a browser-only feature.
  }
  // The storage event only reaches other tabs; notify this one ourselves.
  listeners.forEach((listener) => listener());
}

/** Saved cities, kept in this browser only (no accounts). */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const toggle = useCallback((place: Favorite) => write(toggleFavorite(getSnapshot(), place)), []);
  const isFavorite = useCallback((place: Favorite) => isSaved(favorites, place), [favorites]);

  return { favorites, isFavorite, toggle, isFull: favorites.length >= MAX_FAVORITES };
}
