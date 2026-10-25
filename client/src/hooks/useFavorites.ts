import { isFavorite as isSaved, isSamePlace, MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useCallback, useSyncExternalStore } from 'react';
import { clearHome, EMPTY, getSnapshot, remove, save, setHome, subscribe } from '../favoritesStore';

/** Saved cities and the home city, kept in this browser only (no accounts). */
export function useFavorites() {
  const { favorites, home } = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const isFavorite = useCallback((place: Favorite) => isSaved(favorites, place), [favorites]);
  const isHome = useCallback((place: Favorite) => Boolean(home && isSamePlace(home, place)), [home]);

  return {
    favorites,
    home,
    isFavorite,
    isHome,
    // Module functions: stable, so components can pass them around without useCallback.
    save,
    remove,
    setHome,
    clearHome,
    isFull: favorites.length >= MAX_FAVORITES,
  };
}
