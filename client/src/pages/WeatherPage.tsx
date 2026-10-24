import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CurrentWeather } from '../components/CurrentWeather';
import { ForecastList } from '../components/ForecastList';
import { HourlyForecast } from '../components/HourlyForecast';
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

  const current = forecast;

  usePageMeta(place?.name ?? null);

  if (!place) {
    return <NotFoundPage message={t.notFound.badLink} />;
  }

  if (error) {
    return (
      <div className="message" role="alert">
        <p>{t.errors[error.code]}</p>
        {error.canRetry && (
          <button type="button" onClick={retry}>
            {t.weather.tryAgain}
          </button>
        )}
      </div>
    );
  }

  if (!current) {
    return <p className="message">{t.weather.loading(place.name)}</p>;
  }

  return (
    <div className={loading ? 'content content--stale' : 'content'}>
      <CurrentWeather name={place.name} country={place.country} forecast={current} />
      <HourlyForecast hours={current.hourly} />
      <ForecastList days={current.daily} />
    </div>
  );
}
