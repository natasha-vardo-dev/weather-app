import { describeWeather, type Favorite } from '@weather/shared';
import { Link } from 'react-router';
import { useFavorites } from '../hooks/useFavorites';
import { useForecast } from '../hooks/useForecast';
import { useI18n } from '../i18n/I18nProvider';
import { placePath } from '../locationUrl';
import { WeatherIcon } from './WeatherIcon';

/**
 * One saved city with its current weather. It uses the same request as the city page,
 * so the two share the server and HTTP caches and opening the city is instant.
 */
function FavoriteRow({ favorite }: { favorite: Favorite }) {
  const { t, deg } = useI18n();
  const { forecast } = useForecast(favorite.latitude, favorite.longitude);
  const current = forecast?.current;
  const condition = current ? describeWeather(current.weatherCode) : null;

  return (
    <li>
      <Link className="favorite" to={placePath(favorite)}>
        <span className="favorite__icon" aria-hidden="true">
          {current && condition && <WeatherIcon icon={condition.icon} isDay={current.isDay} />}
        </span>
        <span className="favorite__place">
          <span className="favorite__name">{favorite.name}</span>
          {favorite.country && <span className="favorite__country"> {favorite.country}</span>}
        </span>
        {current && condition && (
          <span className="favorite__temp">
            <span className="visually-hidden">{t.conditions[condition.condition]}, </span>
            {deg(Math.round(current.temperature))}
          </span>
        )}
      </Link>
    </li>
  );
}

/** Saved cities on the start page; nothing at all until the first one is saved. */
export function FavoritesList() {
  const { t } = useI18n();
  const { favorites } = useFavorites();
  if (favorites.length === 0) return null;

  return (
    <section className="favorites" aria-labelledby="favorites-title">
      <h2 id="favorites-title" className="favorites__title">
        {t.favorites.title}
      </h2>
      <ul className="favorites__list">
        {favorites.map((favorite) => (
          <FavoriteRow key={`${favorite.latitude},${favorite.longitude}`} favorite={favorite} />
        ))}
      </ul>
    </section>
  );
}
