import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { UnitProvider } from './units/UnitProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <UnitProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </UnitProvider>
    </I18nProvider>
  </StrictMode>,
);
