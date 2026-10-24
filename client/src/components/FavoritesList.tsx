import type { Favorite } from '@weather/shared';
import { Link } from 'react-router';
import { useCurrentWeather } from '../hooks/useCurrentWeather';
import { useFavorites } from '../hooks/useFavorites';
import { useI18n } from '../i18n/I18nProvider';
import { placePath } from '../locationUrl';
import { WeatherIcon } from './WeatherIcon';

/**
 * One saved city as a card: name, country, icon, current temperature, condition and
 * today's high/low. It uses the same request as the city page (shared cache), so
 * opening the city is instant.
 */
function FavoriteCard({ favorite }: { favorite: Favorite }) {
  const { t, deg } = useI18n();
  const weather = useCurrentWeather(favorite.latitude, favorite.longitude);
  const high = weather?.high ?? null;
  const low = weather?.low ?? null;
  const range = high !== null && low !== null ? { high, low } : null;

  return (
    <li>
      <Link className="fav-card" to={placePath(favorite)}>
        {/* One sentence for screen readers; the visual parts below are hidden from them. */}
        <span className="visually-hidden">
          {[
            favorite.name,
            favorite.country,
            weather && t.conditions[weather.condition],
            weather && t.current.degrees(weather.temperature),
            range && t.current.highLow(range.high, range.low),
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
        <span className="fav-card__head" aria-hidden="true">
          <span className="fav-card__place">
            <span className="fav-card__name">{favorite.name}</span>
            {favorite.country && <span className="fav-card__country">{favorite.country}</span>}
          </span>
          {weather && <WeatherIcon icon={weather.icon} isDay={weather.isDay} size={32} />}
        </span>
        {/* Fixed-height body: a card does not grow when its weather arrives. */}
        <span className="fav-card__body" aria-hidden="true">
          {weather && (
            <>
              <span className="fav-card__temp">{deg(weather.temperature)}</span>
              <span className="fav-card__meta">{t.conditions[weather.condition]}</span>
              {range && (
                <span className="fav-card__meta">
                  {deg(range.high)} / {deg(range.low)}
                </span>
              )}
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

/** Saved cities on the start page as a grid of cards; nothing until the first one is saved. */
export function FavoritesList() {
  const { t } = useI18n();
  const { favorites } = useFavorites();
  if (favorites.length === 0) return null;

  return (
    <section className="favorites" aria-labelledby="favorites-title">
      <h2 id="favorites-title" className="favorites__title">
        {t.favorites.title}
      </h2>
      <ul className="fav-grid">
        {favorites.map((favorite) => (
          <FavoriteCard key={`${favorite.latitude},${favorite.longitude}`} favorite={favorite} />
        ))}
      </ul>
    </section>
  );
}
