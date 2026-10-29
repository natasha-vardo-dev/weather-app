/**
 * Favourites in localStorage: reading, the change subscription for
 * useSyncExternalStore, and the actions. Plain functions, not React, so the storage rules
 * are unit-tested without a browser; `useFavorites` only connects them to components.
 */
import { isFavorite as isSaved, parseFavorites, toggleFavorite, type Favorite } from '@weather/shared';

/** Versioned key: a future format can migrate instead of misreading old data. */
export const FAVORITES_KEY = 'favorites:v1';

const listeners = new Set<() => void>();
let cache: { raw: string | null; favorites: Favorite[] } = { raw: null, favorites: [] };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Storage blocked (privacy mode): behave as empty.
  }
}

function parse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // Corrupted value: treat as empty rather than crash the page.
  }
}

function storedFavorites(): Favorite[] {
  return parseFavorites(parse(read(FAVORITES_KEY)));
}

/**
 * The saved cities, newest first. Same array while storage is unchanged:
 * useSyncExternalStore needs a stable snapshot.
 */
export function getSnapshot(): Favorite[] {
  const raw = read(FAVORITES_KEY);
  if (raw !== cache.raw) cache = { raw, favorites: parseFavorites(parse(raw)) };
  return cache.favorites;
}

export const EMPTY: Favorite[] = [];

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // Fires when another tab changes storage, so every open tab stays in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved (storage full or blocked); nothing else to do in a browser-only feature.
  }
}

function notify() {
  // The storage event only reaches other tabs; notify this one ourselves.
  listeners.forEach((listener) => listener());
}

// Actions say what they do (save, remove), not "toggle": a save can wait for an id check,
// and by then the city may already be saved (a second click on a remounted button,
// another tab). Saving an already saved city must not remove it.

/** Saves the place; does nothing if it is already saved. */
export function save(place: Favorite): void {
  const stored = storedFavorites();
  if (isSaved(stored, place)) return;
  write(FAVORITES_KEY, toggleFavorite(stored, place));
  notify();
}

/** Removes the place; does nothing if it is not saved. */
export function remove(place: Favorite): void {
  const stored = storedFavorites();
  if (!isSaved(stored, place)) return;
  write(FAVORITES_KEY, toggleFavorite(stored, place));
  notify();
}
