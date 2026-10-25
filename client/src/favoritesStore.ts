/**
 * Favourites and the home city in localStorage: reading, the change subscription for
 * useSyncExternalStore, and the actions. Plain functions, not React, so the storage rules
 * are unit-tested without a browser; `useFavorites` only connects them to components.
 */
import {
  isFavorite as isSaved,
  parseFavorites,
  resolveHomeCity,
  toggleFavorite,
  withHomeFirst,
  type Favorite,
} from '@weather/shared';

/** Versioned keys: a future format can migrate instead of misreading old data. */
export const FAVORITES_KEY = 'favorites:v1';
/** The home city is stored apart, so the favourites format did not have to change. */
export const HOME_KEY = 'home-city:v1';

export interface Snapshot {
  /** Display order: home city first, then newest saved first. */
  favorites: Favorite[];
  home: Favorite | null;
}

const listeners = new Set<() => void>();
let cache: { raws: string; snapshot: Snapshot } = { raws: '', snapshot: { favorites: [], home: null } };

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

/** Same object while storage is unchanged: useSyncExternalStore needs a stable snapshot. */
export function getSnapshot(): Snapshot {
  const favoritesRaw = read(FAVORITES_KEY);
  const homeRaw = read(HOME_KEY);
  const raws = `${favoritesRaw}\u0000${homeRaw}`;
  if (raws !== cache.raws) {
    const favorites = parseFavorites(parse(favoritesRaw));
    const home = resolveHomeCity(parse(homeRaw), favorites);
    cache = { raws, snapshot: { favorites: withHomeFirst(favorites, home), home } };
  }
  return cache.snapshot;
}

export const EMPTY: Snapshot = { favorites: [], home: null };

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // Fires when another tab changes storage, so every open tab stays in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === HOME_KEY || e.key === null) listener();
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

/** Removes the place; removing the home city also clears it as home. */
export function remove(place: Favorite): void {
  // Read the home city before writing: once the city leaves the list, the snapshot
  // would no longer report it as home, and its stored value would be left behind.
  const currentHome = getSnapshot().home;
  const stored = storedFavorites();
  if (!isSaved(stored, place)) return;
  const next = toggleFavorite(stored, place);
  write(FAVORITES_KEY, next);
  if (currentHome && !isSaved(next, currentHome)) write(HOME_KEY, null);
  notify();
}

/**
 * Makes the place the home city, saving it first if needed. Does nothing if it cannot be
 * saved (the list filled up meanwhile, e.g. in another tab): the home city is always a
 * saved one, or a later save of this city would silently make it home.
 */
export function setHome(place: Favorite): void {
  const stored = storedFavorites();
  if (!isSaved(stored, place)) {
    const next = toggleFavorite(stored, place);
    if (!isSaved(next, place)) return;
    write(FAVORITES_KEY, next);
  }
  const { latitude, longitude, name, country } = place;
  write(HOME_KEY, { latitude, longitude, name, ...(country ? { country } : {}) });
  notify();
}

/** Clears the home city; the city stays saved. */
export function clearHome(): void {
  write(HOME_KEY, null);
  notify();
}
