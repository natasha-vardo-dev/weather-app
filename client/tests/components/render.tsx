import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../src/i18n/I18nProvider';
import { UnitProvider } from '../../src/units/UnitProvider';

/**
 * Renders a component with the app's providers, in English and °C unless the test chooses
 * otherwise (jsdom reports en-US, whose default could depend on the machine's time zone).
 */
export function renderWithApp(
  ui: ReactElement,
  {
    language = 'en',
    unit = 'celsius',
    route = '/',
    ...options
  }: { language?: string; unit?: 'celsius' | 'fahrenheit'; route?: string } & RenderOptions = {},
) {
  localStorage.setItem('language', language);
  localStorage.setItem('temperature-unit', unit);
  const user = userEvent.setup();
  // As a wrapper, so `rerender` (new props from a test) keeps the providers.
  const result = render(ui, {
    wrapper: ({ children }) => (
      <I18nProvider>
        <UnitProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </UnitProvider>
      </I18nProvider>
    ),
    ...options,
  });
  return { user, ...result };
}
