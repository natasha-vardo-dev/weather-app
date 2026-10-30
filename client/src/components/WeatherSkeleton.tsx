import { FORECAST_DEFAULT_DAYS } from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Placeholder with roughly the shape and height of a loaded city page, so the page
 * neither collapses nor jumps while the forecast loads. Screen readers get the
 * loading message instead of the grey blocks.
 */
export function WeatherSkeleton({ place }: { place: string }) {
  const { t } = useI18n();
  return (
    <div className="skeleton">
      <p className="visually-hidden" role="status">
        {t.weather.loading(place)}
      </p>
      <div aria-hidden="true">
        <div className="skeleton__block" style={{ width: '12rem', height: '2rem' }} />
        <div className="skeleton__block" style={{ width: '9rem', height: '6rem', marginTop: '0.75rem' }} />
        <div className="skeleton__block" style={{ width: '16rem', height: '1.5rem', marginTop: '0.75rem' }} />
        <div className="skeleton__block" style={{ width: '100%', height: '6rem', marginTop: '2.5rem' }} />
        {Array.from({ length: FORECAST_DEFAULT_DAYS }, (_, i) => (
          <div
            key={i}
            className="skeleton__block"
            style={{ width: '100%', height: '2.2rem', marginTop: i === 0 ? '2.5rem' : '0.6rem' }}
          />
        ))}
        <div className="skeleton__block" style={{ width: '100%', height: '6.5rem', marginTop: '2rem' }} />
      </div>
    </div>
  );
}
