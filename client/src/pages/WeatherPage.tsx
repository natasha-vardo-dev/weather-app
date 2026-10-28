import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CurrentWeather } from '../components/CurrentWeather';
import { FavoriteButton } from '../components/FavoriteButton';
import { FavoritesStrip } from '../components/FavoritesStrip';
import { ForecastList } from '../components/ForecastList';
import { HourlyForecast } from '../components/HourlyForecast';
import { WeatherAlerts } from '../components/WeatherAlerts';
import { WeatherSkeleton } from '../components/WeatherSkeleton';
import { useAirQuality } from '../hooks/useAirQuality';
import { useAlerts } from '../hooks/useAlerts';
import { useForecast } from '../hooks/useForecast';
import { usePageMeta } from '../hooks/usePageMeta';
import { placeTitle, useLocalizedPlace } from '../hooks/useLocalizedPlace';
import { useI18n } from '../i18n/I18nProvider';
import { rememberedPosition } from '../geolocation';
import { parsePlace } from '../locationUrl';
import { NotFoundPage } from './NotFoundPage';

export function WeatherPage() {
  const { t } = useI18n();
  const { coords } = useParams();
  const [searchParams] = useSearchParams();
  const place = useMemo(() => parsePlace(coords, searchParams), [coords, searchParams]);

  const { forecast, loading, error, retry } = useForecast(
    place?.latitude ?? null,
    place?.longitude ?? null,
  );

  // Fetched in parallel with the forecast and never blocks it.
  const { airQuality, retry: retryAirQuality } = useAirQuality(place?.latitude ?? null, place?.longitude ?? null);

  // Official warnings: their own request, like air quality; shown even if the forecast fails.
  const alerts = useAlerts(place?.latitude ?? null, place?.longitude ?? null);

  const current = forecast;

  // The URL carries the name in the language it was found in; show the current one.
  const names = useLocalizedPlace(place);
  const title = names ? placeTitle(names, t.place.island) : null;
  // An invalid link renders NotFoundPage inside this page; parent effects run after the
  // child's, so this page must set the same title or it would overwrite "Not found".
  usePageMeta(place ? title : t.notFound.pageTitle);

  if (!place) {
    return <NotFoundPage message={t.notFound.badLink} />;
  }

  let body: ReactNode;
  if (error) {
    body = (
      <div className="message" role="alert">
        <p>{t.errors[error.code]}</p>
        {error.canRetry && (
          <button
            type="button"
            onClick={() => {
              retry();
              retryAirQuality();
            }}
          >
            {t.weather.tryAgain}
          </button>
        )}
      </div>
    );
  } else if (!current) {
    body = <WeatherSkeleton place={title ?? place.name} />;
  } else {
    body = (
      <div className={loading ? 'content content--stale' : 'content'}>
        <CurrentWeather
          // A new place gets a fresh component (focus, folded details), even when the
          // forecast comes straight from the cache and nothing else would remount it.
          key={`${place.latitude},${place.longitude}`}
          name={title ?? place.name}
          country={names ? names.country : place.country}
          forecast={current}
          airQuality={airQuality}
          actions={<FavoriteButton place={place} />}
          here={rememberedPosition(place.latitude, place.longitude)}
        />
        <HourlyForecast hours={current.hourly} />
        <ForecastList days={current.daily} />
      </div>
    );
  }

  // The strip stays above every state (loading, error, forecast): switching cities
  // should not have to wait for the current one. Warnings come right after it, above the
  // city name, in every state too: the most prominent place, chosen knowing that the page
  // below moves down when they arrive a moment after a cached forecast.
  return (
    <>
      <FavoritesStrip place={place} />
      <WeatherAlerts data={alerts} timeZone={forecast?.timezone} />
      {body}
    </>
  );
}
