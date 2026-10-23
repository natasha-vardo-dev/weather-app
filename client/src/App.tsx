import { Route, Routes, useNavigate } from 'react-router';
import { SearchBar } from './components/SearchBar';
import { placePath } from './locationUrl';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WeatherPage } from './pages/WeatherPage';

export function App() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <header className="page__header">
        <SearchBar onSelect={(location) => navigate(placePath(location))} />
      </header>

      <main className="page__main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/weather/:coords" element={<WeatherPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="page__footer">
        Weather data by{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
      </footer>
    </div>
  );
}
