import { act, screen } from '@testing-library/react';
import type { AlertsResponse, WeatherAlert } from '@weather/shared';
import { describe, expect, it, vi } from 'vitest';
import { WeatherAlerts } from '../../src/components/WeatherAlerts';
import { noAlerts } from '../fixtures/weather';
import { renderWithApp } from './render';

const HOUR = 60 * 60 * 1000;

function alert(id: string, level: WeatherAlert['level'], type: WeatherAlert['type']): WeatherAlert {
  return {
    id,
    level,
    type,
    onset: new Date(Date.now() - HOUR).toISOString(),
    expires: new Date(Date.now() + 5 * HOUR).toISOString(),
    language: 'en-GB',
    event: 'Event',
    description: `Description of ${id}`,
    sender: 'IMGW-PIB',
  };
}

const three: AlertsResponse = {
  ...noAlerts,
  // Most severe first, as the API sends them.
  alerts: [alert('a', 'red', 'thunderstorm'), alert('b', 'orange', 'wind'), alert('c', 'yellow', 'fog')],
};

describe('WeatherAlerts', () => {
  it('shows nothing without warnings', () => {
    const { container } = renderWithApp(<WeatherAlerts data={noAlerts} timeZone="Europe/Warsaw" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the most severe warning and folds the rest behind a button', async () => {
    const { user } = renderWithApp(<WeatherAlerts data={three} timeZone="Europe/Warsaw" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Red warning: Thunderstorms')).toBeInTheDocument();
    expect(screen.getByText(/^Until /)).toBeInTheDocument();

    const more = screen.getByRole('button', { name: '2 more warnings' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the issuer’s text and credits the source', async () => {
    const { user } = renderWithApp(<WeatherAlerts data={three} timeZone="Europe/Warsaw" />);

    await user.click(screen.getByText('Red warning: Thunderstorms'));
    expect(screen.getByText('Description of a')).toBeVisible();
    expect(screen.getByText('IMGW-PIB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'EUMETNET – MeteoAlarm' })).toHaveAttribute(
      'href',
      'https://meteoalarm.org',
    );
  });

  it('waits for the place’s time zone before showing times', () => {
    renderWithApp(<WeatherAlerts data={three} />);
    expect(screen.queryByText(/^Until /)).not.toBeInTheDocument();
  });

  it('drops a warning once it has expired, while the page stays open', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-03-10T12:00:00Z') });
    try {
      const soon = { ...alert('a', 'red', 'thunderstorm'), expires: new Date(Date.now() + 30_000).toISOString() };
      const later = alert('b', 'orange', 'wind');
      renderWithApp(<WeatherAlerts data={{ ...noAlerts, alerts: [soon, later] }} timeZone="Europe/Warsaw" />);
      expect(screen.getByText('Red warning: Thunderstorms')).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(60_000));

      expect(screen.queryByText('Red warning: Thunderstorms')).not.toBeInTheDocument();
      expect(screen.getByText('Orange warning: Wind')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /more warnings/ })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
