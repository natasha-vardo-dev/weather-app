import { MAX_FAVORITES, type Favorite } from '@weather/shared';
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
 * Toggle button: the label stays "Save" and aria-pressed tells screen readers whether the
 * city is saved; the star fills in for sighted users.
 */
export function FavoriteButton({ place }: { place: Favorite }) {
  const { t } = useI18n();
  const { isFavorite, toggle, isFull } = useFavorites();
  const saved = isFavorite(place);
  const blocked = !saved && isFull;

  return (
    <button
      type="button"
      className="save"
      aria-pressed={saved}
      // A full list blocks saving rather than silently dropping another city.
      disabled={blocked}
      title={blocked ? t.favorites.full(MAX_FAVORITES) : saved ? t.favorites.remove : t.favorites.add}
      onClick={() => toggle(place)}
    >
      <StarIcon />
      {t.favorites.save}
    </button>
  );
}
