import { useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { AlertBell } from '../components/AlertBell';
import { CurrentWeather } from '../components/CurrentWeather';
import { FavoriteButton } from '../components/FavoriteButton';
import { FavoritesStrip } from '../components/FavoritesStrip';
import { ForecastList } from '../components/ForecastList';
import { HourlyForecast } from '../components/HourlyForecast';
import { WeatherAlerts } from '../components/WeatherAlerts';
import { WeatherTiles } from '../components/WeatherTiles';
import { WeatherSkeleton } from '../components/WeatherSkeleton';
import { useAirQuality } from '../hooks/useAirQuality';
import { useAlerts } from '../hooks/useAlerts';
import { useForecast } from '../hooks/useForecast';
import { usePageMeta } from '../hooks/usePageMeta';
import { placeSubtitle, placeTitle, useLocalizedPlace } from '../hooks/useLocalizedPlace';
import { placeArea } from '../placeLabels';
import { useI18n } from '../i18n/I18nProvider';
import { rememberedPosition } from '../geolocation';
import { parsePlaceRoute, placePath } from '../locationUrl';
import { usePlaceRoute } from '../hooks/usePlaceRoute';
import { NotFoundPage } from './NotFoundPage';

export function WeatherPage() {
  const { t, language } = useI18n();
  const { where } = useParams();
  const [searchParams] = useSearchParams();
  const route = useMemo(() => parsePlaceRoute(where, searchParams), [where, searchParams]);
  const { state, canonical, retry: retryRoute } = usePlaceRoute(route);
  const place = state.status === 'ready' ? state.place : null;

  // One address per city: an old link (?id=) or a slug in another language or edited by
  // hand becomes /weather/756135-warsaw, replacing the entry rather than adding one.
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (canonical && canonical !== location.pathname) navigate(canonical, { replace: true });
  }, [canonical, location.pathname, navigate]);

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
  const missing = state.status === 'invalid' || state.status === 'not-found';
  usePageMeta(missing ? t.notFound.pageTitle : title);

  if (missing) {
    return <NotFoundPage message={t.notFound.badLink} />;
  }
  if (!place) {
    // The place behind an id is still being looked up (or the lookup failed).
    return (
      <>
        <FavoritesStrip place={null} />
        {state.status === 'error' ? (
          <div className="message" role="alert">
            <p>{t.errors[state.code]}</p>
            <button type="button" onClick={retryRoute}>
              {t.weather.tryAgain}
            </button>
          </div>
        ) : (
          // The slug is all there is to name it for screen readers meanwhile ("warsaw").
          <WeatherSkeleton place={route?.kind === 'id' ? route.slug.replace(/-/g, ' ') : ''} />
        )}
      </>
    );
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
          // The name, with "island" and the country beside it ("island · Greece"); district
          // and region on a line below, so a town is placed even when another has its name.
          // The tab title and the notification keep "Rhodes · island".
          name={names ? names.name : place.name}
          country={names ? placeSubtitle(names, t.place.island) : place.country}
          area={names ? placeArea(names, language) : []}
          forecast={current}
          actions={
            <span className="save-wrap">
              <FavoriteButton place={place} />
              <AlertBell
                latitude={place.latitude}
                longitude={place.longitude}
                name={title ?? place.name}
                url={placePath(place)}
                timeZone={current.timezone}
                covered={alerts?.covered}
              />
            </span>
          }
          here={rememberedPosition(place.latitude, place.longitude)}
        />
        <HourlyForecast hours={current.hourly} days={current.daily} now={current.current.time} />
        <ForecastList days={current.daily} now={current.current.temperature} />
        {/* Remounted per place too: a new city starts with every tile folded. */}
        <WeatherTiles key={`tiles:${place.latitude},${place.longitude}`} forecast={current} airQuality={airQuality} />
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
      {/* Keyed by place, so the next city starts with its warnings folded again. */}
      <WeatherAlerts key={`alerts:${place.latitude},${place.longitude}`} data={alerts} timeZone={forecast?.timezone} />
      {body}
    </>
  );
}
