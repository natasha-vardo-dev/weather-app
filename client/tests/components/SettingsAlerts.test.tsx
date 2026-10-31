import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsMenu } from '../../src/components/SettingsMenu';
import { renderWithApp } from './render';

// The warnings list in the settings, with the notification store reduced to its state: the
// real one needs Firebase and a service worker.
const overview = vi.hoisted(() => ({ places: [] as unknown[], disable: vi.fn(async () => {}), enable: vi.fn() }));
vi.mock('../../src/hooks/useAlertNotifications', () => ({
  useAlertOverview: () => ({ status: 'available', ...overview }),
}));
vi.mock('../../src/hooks/useAlerts', () => ({ useAlerts: () => ({ alerts: [], covered: true }) }));

const krakow = {
  latitude: 50.06,
  longitude: 19.94,
  name: 'Kraków',
  url: '/weather/3094802-krakow',
  group: 'storm',
  level: 'orange',
  areas: ['PL1261'],
};

describe('SettingsMenu warnings list', () => {
  it('keeps a place turned on in another tab, greyed, after it is switched off here', async () => {
    overview.places = [];
    const view = renderWithApp(<SettingsMenu />);
    await view.user.click(screen.getByRole('button', { name: 'Settings' }));
    await view.user.click(screen.getByRole('button', { name: /^Warnings/ }));

    // Turned on in another tab while the list is open.
    overview.places = [krakow];
    view.rerender(<SettingsMenu />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await view.user.click(toggle);
    expect(overview.disable).toHaveBeenCalled();
    overview.places = [];
    view.rerender(<SettingsMenu />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Kraków/, { selector: 'a' })).toBeInTheDocument();
  });
});
