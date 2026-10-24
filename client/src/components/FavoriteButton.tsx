import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useId } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { useI18n } from '../i18n/I18nProvider';

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
 */
export function FavoriteButton({ place }: { place: Favorite }) {
  const { t } = useI18n();
  const { isFavorite, toggle, isFull } = useFavorites();
  const hintId = useId();
  const saved = isFavorite(place);
  const blocked = !saved && isFull;

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
          if (!blocked) toggle(place);
        }}
      >
        <StarIcon />
        {saved ? t.favorites.saved : t.favorites.save}
        {saved && <span className="visually-hidden">: {t.favorites.remove}</span>}
      </button>
      {blocked && (
        <span id={hintId} className="save__hint">
          {t.favorites.full(MAX_FAVORITES)}
        </span>
      )}
    </span>
  );
}
