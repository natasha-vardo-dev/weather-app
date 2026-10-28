import { Route, Routes, useNavigate } from 'react-router';
import { LanguageSelect } from './components/LanguageSelect';
import { UnitSelect } from './components/UnitSelect';
import { SearchBar } from './components/SearchBar';
import { useOffline } from './hooks/useOffline';
import { usePushMaintenance } from './hooks/useAlertNotifications';
import { useI18n } from './i18n/I18nProvider';
import { placePath } from './locationUrl';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WeatherPage } from './pages/WeatherPage';

export function App() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const offline = useOffline();
  usePushMaintenance();

  return (
    <div className="page">
      <header className="page__header">
        <SearchBar
          onSelect={(location) => navigate(placePath(location))}
          onLocate={(place) => navigate(placePath(place))}
        />
        <UnitSelect />
        <LanguageSelect />
      </header>

      <main className="page__main">
        {/* The live region stays in the page, so going offline is announced. Offline the
            service worker serves the last loaded forecasts, so the banner warns they may be old. */}
        <div role="status">{offline && <p className="offline-banner">{t.offline}</p>}</div>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/weather/:coords" element={<WeatherPage />} />
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
