import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useId, useRef } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { withVerifiedId } from '../hooks/useLocalizedPlace';
import { useI18n } from '../i18n/I18nProvider';

/** Outline star; filled when the city is saved. Also marks saved cities in the settings. */
export function StarIcon({ className = 'save__star', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

/**
 * Save, next to the place name: the star alone.
 *
 * When the list is full the button is aria-disabled, not disabled: it stays focusable,
 * and the visible hint is linked with aria-describedby, so keyboard and screen-reader
 * users learn why saving does nothing (a native disabled button is skipped by Tab).
 *
 * Saving keeps the place's id only once it is confirmed (`withVerifiedId`). The button
 * stays enabled meanwhile: a click waits for the check, which has almost always finished.
 */
export function FavoriteButton({ place }: { place: Favorite }) {
  const { t, language } = useI18n();
  const { isFavorite, save, remove, isFull } = useFavorites();
  // Clicks run through one queue, in click order: a removal clicked right after a save is
  // not overtaken by it. Saving waits for the id check, removing does not, but both wait
  // for earlier clicks. Repeats are harmless (saving a saved city or removing a removed one
  // does nothing).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const hintId = useId();
  const saved = isFavorite(place);
  const blocked = !saved && isFull;

  function enqueue(step: () => unknown) {
    // A failure must not stop later clicks from running.
    queue.current = queue.current.then(step).then(
      () => {},
      () => {},
    );
  }

  /** Saving waits for the id check (usually done already: the page started it). */
  function saveAfterCheck() {
    enqueue(() => withVerifiedId(place, language).then(save));
  }

  return (
    <span className="save-wrap">
      {/* The star alone: the sign of favourites everywhere. Its name says what pressing does
          ("Add to favourites" / "Remove from favourites"), which also tells the state, so no
          aria-pressed; the tooltip shows the state ("In favourites"). One word for it all,
          "favourites": the section is called so, and "Save" landing in "Favourites" read as
          two different things. */}
      <button
        type="button"
        className="save save--icon"
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? hintId : undefined}
        data-saved={saved || undefined}
        data-tip={saved ? t.favorites.saved : t.favorites.save}
        onClick={() => {
          // A full list blocks saving rather than silently dropping another city.
          if (blocked) return;
          // Removing needs no id check (places match by coordinates), only earlier clicks.
          if (saved) enqueue(() => remove(place));
          else saveAfterCheck();
        }}
      >
        <StarIcon />
        <span className="visually-hidden">
          {saved ? t.favorites.remove : t.favorites.save}
        </span>
      </button>
      {blocked && (
        <span id={hintId} className="save__hint">
          {t.favorites.full(MAX_FAVORITES)}
        </span>
      )}
    </span>
  );
}
