import { isFavorite as isSaved, MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useCallback, useSyncExternalStore } from 'react';
import { EMPTY, getSnapshot, remove, save, subscribe } from '../favoritesStore';

/** Saved cities, kept in this browser only (no accounts). */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const isFavorite = useCallback((place: Favorite) => isSaved(favorites, place), [favorites]);

  return {
    favorites,
    isFavorite,
    // Module functions: stable, so components can pass them around without useCallback.
    save,
    remove,
    isFull: favorites.length >= MAX_FAVORITES,
  };
}
