import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CurrentWeather } from '../components/CurrentWeather';
import { ForecastList } from '../components/ForecastList';
import { HourlyForecast } from '../components/HourlyForecast';
import { useForecast } from '../hooks/useForecast';
import { usePageMeta } from '../hooks/usePageMeta';
import { parsePlace } from '../locationUrl';
import { NotFoundPage } from './NotFoundPage';

export function WeatherPage() {
  const { coords } = useParams();
  const [searchParams] = useSearchParams();
  const place = useMemo(() => parsePlace(coords, searchParams), [coords, searchParams]);

  const { forecast, loading, error, retry } = useForecast(
    place?.latitude ?? null,
    place?.longitude ?? null,
  );

  const current = forecast;

  usePageMeta(place?.name ?? null);

  if (!place) {
    return <NotFoundPage message="This link doesn't point to a valid location." />;
  }

  if (error) {
    return (
      <div className="message" role="alert">
        <p>{error.message}</p>
        {error.canRetry && (
          <button type="button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!current) {
    return <p className="message">Loading forecast for {place.name}…</p>;
  }

  return (
    <div className={loading ? 'content content--stale' : 'content'}>
      <CurrentWeather name={place.name} country={place.country} forecast={current} />
      <HourlyForecast hours={current.hourly} />
      <ForecastList days={current.daily} />
    </div>
  );
}
