import { isFavorite, type Favorite } from '@weather/shared';
import { Link } from 'react-router';
import { useAlertLevel } from '../hooks/useAlerts';
import { useCurrentWeather } from '../hooks/useCurrentWeather';
import { placeSubtitle, useFavoriteDistinctions, useLocalizedPlace } from '../hooks/useLocalizedPlace';
import { useFavorites } from '../hooks/useFavorites';
import { useI18n } from '../i18n/I18nProvider';
import { placePath } from '../locationUrl';
import { AlertMark } from './WeatherAlerts';
import { WeatherIcon } from './WeatherIcon';

function FavoriteTile({
  favorite,
  current,
  distinction,
}: {
  favorite: Favorite;
  current: boolean;
  /** What tells it apart from a saved place of the same name (a district); usually none. */
  distinction?: string;
}) {
  const { t, deg } = useI18n();
  const weather = useCurrentWeather(favorite.latitude, favorite.longitude);
  const alertLevel = useAlertLevel(favorite.latitude, favorite.longitude);
  // Names in the current UI language, not the one the city was saved in.
  const names = useLocalizedPlace(favorite);
  const { name } = names;
  // "island · Greece": an island and the town of its name must not look the same; two saved
  // places of one name get what tells them apart first ("Powiat otwocki · Poland").
  const country = [distinction, placeSubtitle(names, t.place.island)].filter(Boolean).join(' · ') || undefined;

  return (
    <li>
      <Link
        className={['fav-tile', current && 'fav-tile--current', alertLevel && 'fav-tile--alert'].filter(Boolean).join(' ')}
        to={placePath(favorite)}
        aria-current={current ? 'page' : undefined}
        // Full name on hover, since long names and countries are cut with an ellipsis.
        title={[name, country].filter(Boolean).join(', ')}
      >
        {/* One sentence for screen readers instead of four loose pieces. */}
        <span className="visually-hidden">
          {[
            name,
            country,
            weather && t.conditions[weather.condition],
            weather && t.current.degrees(weather.temperature),
            alertLevel && t.alerts.levels[alertLevel],
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
        <span className="fav-tile__name" dir="auto" aria-hidden="true">
          {name}
        </span>
        {country && (
          <span className="fav-tile__country" dir="auto" aria-hidden="true">
            {country}
          </span>
        )}
        <span className="fav-tile__weather" aria-hidden="true">
          {weather && (
            <>
              <WeatherIcon icon={weather.icon} isDay={weather.isDay} size={18} />
              {deg(weather.temperature)}
            </>
          )}
        </span>
        {/* In the top corner, where the eye starts; the name makes room for it (see styles). */}
        {alertLevel && <AlertMark level={alertLevel} className="fav-tile__alert" />}
      </Link>
    </li>
  );
}

/**
 * Saved cities as a scrolling strip at the top of a city page, for quick switching.
 * The open city stays in the strip, highlighted, so tiles never jump around.
 * Hidden until the first city is saved.
 */
export function FavoritesStrip({ place }: { place: Favorite }) {
  const { t } = useI18n();
  const { favorites } = useFavorites();
  const distinctions = useFavoriteDistinctions(favorites);
  if (favorites.length === 0) return null;

  return (
    <nav className="fav-strip" aria-label={t.favorites.title}>
      <ul className="fav-strip__list">
        {favorites.map((favorite, i) => (
          <FavoriteTile
            key={`${favorite.latitude},${favorite.longitude}`}
            favorite={favorite}
            current={isFavorite([favorite], place)}
            distinction={distinctions[i]}
          />
        ))}
      </ul>
    </nav>
  );
}
