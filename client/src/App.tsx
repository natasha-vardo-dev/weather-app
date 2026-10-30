import { Link, Route, Routes, useLocation, useNavigate } from 'react-router';
import { SearchBar } from './components/SearchBar';
import { SettingsMenu } from './components/SettingsMenu';
import { WeatherIcon } from './components/WeatherIcon';
import { useOffline } from './hooks/useOffline';
import { usePushMaintenance } from './hooks/useAlertNotifications';
import { useI18n } from './i18n/I18nProvider';
import { placePath } from './locationUrl';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WeatherPage } from './pages/WeatherPage';

export function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useI18n();
  const offline = useOffline();
  usePushMaintenance();

  return (
    <div className="page">
      <header className="page__header">
        {/* The app's icon and name on a line of their own above the search lead to the start
            page, as a logo does on most sites (yr.no, AccuWeather); without it the only way
            back was the browser's, and none at all after opening a shared city link. With the
            name it reads as the site's title: the icon alone, by the search, was taken for a
            control nobody knew the purpose of. */}
        <Link
          className="page__brand"
          to="/"
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          {/* The icon as on the Home Screen after installing: the app's blue tile. */}
          <span className="page__badge" aria-hidden="true">
            <WeatherIcon icon="partly-cloudy" isDay size={22} />
          </span>
          {t.brandName}
        </Link>
        <div className="page__bar">
          <SearchBar
            onSelect={(location) => navigate(placePath(location))}
            onLocate={(place) => navigate(placePath(place))}
          />
          <SettingsMenu />
        </div>
      </header>

      <main className="page__main">
        {/* The live region stays in the page, so going offline is announced. Offline the
            service worker serves the last loaded forecasts, so the banner warns they may be old. */}
        <div role="status">{offline && <p className="offline-banner">{t.offline}</p>}</div>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/weather/:where" element={<WeatherPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="page__footer">
        {t.dataBy}{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        {/* Required by OpenStreetMap's licence: names for the user's location come from it. */}
        {' · '}
        {t.placesBy}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
      </footer>
    </div>
  );
}
