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
import { useI18n } from '../i18n/I18nProvider';
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
  const airQuality = useAirQuality(place?.latitude ?? null, place?.longitude ?? null);

  const current = forecast;

  usePageMeta(place?.name ?? null);

  if (!place) {
    return <NotFoundPage message={t.notFound.badLink} />;
  }

  let body: ReactNode;
  if (error) {
    body = (
      <div className="message" role="alert">
        <p>{t.errors[error.code]}</p>
        {error.canRetry && (
          <button type="button" onClick={retry}>
            {t.weather.tryAgain}
          </button>
        )}
      </div>
    );
  } else if (!current) {
    body = <WeatherSkeleton place={place.name} />;
  } else {
    body = (
      <div className={loading ? 'content content--stale' : 'content'}>
        <CurrentWeather
          // A new place gets a fresh component (focus, folded details), even when the
          // forecast comes straight from the cache and nothing else would remount it.
          key={`${place.latitude},${place.longitude}`}
          name={place.name}
          country={place.country}
          forecast={current}
          airQuality={airQuality}
          actions={<FavoriteButton place={place} />}
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
