import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportError, reportUncaughtErrors } from './errorReporting';
import { I18nProvider } from './i18n/I18nProvider';
import { UnitProvider } from './units/UnitProvider';
import './styles/index.css';

reportUncaughtErrors();

createRoot(document.getElementById('root')!, {
  // Render errors go to the server's log: caught by an ErrorBoundary (a message is shown) or
  // not (React unmounts the app). Logged to the console as React would, for development.
  onCaughtError: (error, info) => {
    console.error(error);
    reportError('render', error, info.componentStack);
  },
  onUncaughtError: (error, info) => {
    console.error(error);
    reportError('render', error, info.componentStack);
  },
}).render(
  <StrictMode>
    {/* Last resort, outside the providers (they may be what failed): plain English. */}
    <ErrorBoundary fallback={<FatalMessage />}>
      <I18nProvider>
        <UnitProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UnitProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);

function FatalMessage() {
  return (
    <div className="page">
      <div className="message" role="alert">
        <p>
          <strong>Something went wrong</strong>
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    </div>
  );
}
