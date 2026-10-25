import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useId, useRef } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { withVerifiedId } from '../hooks/useLocalizedPlace';
import { useI18n } from '../i18n/I18nProvider';

/** House outline; filled yellow when the city is the home city. */
export function HomeIcon({ className = 'home__icon', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="save__star" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

/**
 * The label shows the state ("Save" / "Saved") and the star fills in. Because the label
 * already says the state, there is no aria-pressed (screen readers would announce it
 * twice); for a saved city hidden text adds what pressing does. The accessible name still
 * starts with the visible word, so voice control ("click Saved") keeps working.
 *
 * When the list is full the button is aria-disabled, not disabled: it stays focusable,
 * and the visible hint is linked with aria-describedby, so keyboard and screen-reader
 * users learn why saving does nothing (a native disabled button is skipped by Tab).
 *
 * Saving keeps the place's id only once it is confirmed (`withVerifiedId`). The buttons
 * stay enabled meanwhile: a click waits for the check, which has almost always finished.
 */
export function FavoriteButton({ place }: { place: Favorite }) {
  const { t, language } = useI18n();
  const { isFavorite, isHome, save, remove, setHome, clearHome, isFull } = useFavorites();
  // Every action runs through one queue, in click order: "Save" then "Set as home" both
  // happen, and a removal clicked after them is not overtaken by them. Saving waits for the
  // id check, removing does not, but both wait for earlier clicks. Repeats are harmless
  // (saving a saved city or removing a removed one does nothing).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const hintId = useId();
  const saved = isFavorite(place);
  const home = isHome(place);
  // Both actions save the city, so both are blocked by a full list.
  const blocked = !saved && isFull;

  function enqueue(step: () => unknown) {
    // A failure must not stop later clicks from running.
    queue.current = queue.current.then(step).then(
      () => {},
      () => {},
    );
  }

  /** Saving waits for the id check (usually done already: the page started it). */
  function afterCheck(action: (place: Favorite) => void) {
    enqueue(() => withVerifiedId(place, language).then(action));
  }

  return (
    <span className="save-wrap">
      <button
        type="button"
        className="save"
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? hintId : undefined}
        // A saved city already explains the action in hidden text; a title would make
        // screen readers repeat "Remove from favourites" as the description.
        title={blocked || saved ? undefined : t.favorites.add}
        data-saved={saved || undefined}
        onClick={() => {
          // A full list blocks saving rather than silently dropping another city.
          if (blocked) return;
          // Removing needs no id check (places match by coordinates), only earlier clicks.
          if (saved) enqueue(() => remove(place));
          else afterCheck(save);
        }}
      >
        <StarIcon />
        {saved ? t.favorites.saved : t.favorites.save}
        {saved && <span className="visually-hidden">: {t.favorites.remove}</span>}
      </button>
      {/* Same pattern as Save: the label states the state, hidden text the action. */}
      <button
        type="button"
        className="save"
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? hintId : undefined}
        data-home={home || undefined}
        onClick={() => {
          if (blocked) return;
          if (home) enqueue(clearHome);
          else afterCheck(setHome);
        }}
      >
        <HomeIcon />
        {home ? t.favorites.homeCity : t.favorites.setHome}
        {home && <span className="visually-hidden">: {t.favorites.unsetHome}</span>}
      </button>
      {blocked && (
        <span id={hintId} className="save__hint">
          {t.favorites.full(MAX_FAVORITES)}
        </span>
      )}
    </span>
  );
}
