import { isFavorite, type Favorite } from '@weather/shared';
import { Link } from 'react-router';
import { useCurrentWeather } from '../hooks/useCurrentWeather';
import { useLocalizedPlace } from '../hooks/useLocalizedPlace';
import { useFavorites } from '../hooks/useFavorites';
import { useI18n } from '../i18n/I18nProvider';
import { placePath } from '../locationUrl';
import { HomeIcon } from './FavoriteButton';
import { WeatherIcon } from './WeatherIcon';

function FavoriteTile({ favorite, current, home }: { favorite: Favorite; current: boolean; home: boolean }) {
  const { t, deg } = useI18n();
  const weather = useCurrentWeather(favorite.latitude, favorite.longitude);
  // Names in the current UI language, not the one the city was saved in.
  const { name, country } = useLocalizedPlace(favorite);

  return (
    <li>
      <Link
        className={current ? 'fav-tile fav-tile--current' : 'fav-tile'}
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
            home && t.favorites.homeCity,
            weather && t.conditions[weather.condition],
            weather && t.current.degrees(weather.temperature),
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
        <span className="fav-tile__name" aria-hidden="true">
          {home && <HomeIcon className="home-mark" size={11} />}
          {name}
        </span>
        {country && (
          <span className="fav-tile__country" aria-hidden="true">
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
  const { favorites, isHome } = useFavorites();
  if (favorites.length === 0) return null;

  return (
    <nav className="fav-strip" aria-label={t.favorites.title}>
      <ul className="fav-strip__list">
        {favorites.map((favorite) => (
          <FavoriteTile
            key={`${favorite.latitude},${favorite.longitude}`}
            favorite={favorite}
            current={isFavorite([favorite], place)}
            home={isHome(favorite)}
          />
        ))}
      </ul>
    </nav>
  );
}
