import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CurrentWeather } from '../components/CurrentWeather';
import { FavoriteButton } from '../components/FavoriteButton';
import { FavoritesStrip } from '../components/FavoritesStrip';
import { ForecastList } from '../components/ForecastList';
import { HourlyForecast } from '../components/HourlyForecast';
import { WeatherSkeleton } from '../components/WeatherSkeleton';
import { useAirQuality } from '../hooks/useAirQuality';
import { useForecast } from '../hooks/useForecast';
import { usePageMeta } from '../hooks/usePageMeta';
import { useLocalizedPlace } from '../hooks/useLocalizedPlace';
import { useI18n } from '../i18n/I18nProvider';
import { isRememberedPosition } from '../geolocation';
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

  const current = forecast;

  // The URL carries the name in the language it was found in; show the current one.
  const names = useLocalizedPlace(place);
  // An invalid link renders NotFoundPage inside this page; parent effects run after the
  // child's, so this page must set the same title or it would overwrite "Not found".
  usePageMeta(place ? (names?.name ?? null) : t.notFound.pageTitle);

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
    body = <WeatherSkeleton place={names?.name ?? place.name} />;
  } else {
    body = (
      <div className={loading ? 'content content--stale' : 'content'}>
        <CurrentWeather
          // A new place gets a fresh component (focus, folded details), even when the
          // forecast comes straight from the cache and nothing else would remount it.
          key={`${place.latitude},${place.longitude}`}
          name={names?.name ?? place.name}
          country={names ? names.country : place.country}
          forecast={current}
          airQuality={airQuality}
          actions={<FavoriteButton place={place} />}
          here={isRememberedPosition(place.latitude, place.longitude)}
        />
        <HourlyForecast hours={current.hourly} />
        <ForecastList days={current.daily} />
      </div>
    );
  }

  // The strip stays above every state (loading, error, forecast): switching cities
  // should not have to wait for the current one.
  return (
    <>
      <FavoritesStrip place={place} />
      {body}
    </>
  );
}
