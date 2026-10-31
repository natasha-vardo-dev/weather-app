import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertBell } from '../../src/components/AlertBell';
import { renderWithApp } from './render';

// The hook talks to Firebase and the service worker; here it is only its state.
const hook = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  enable: vi.fn(),
  disable: vi.fn(),
}));
vi.mock('../../src/hooks/useAlertNotifications', () => ({
  useAlertNotifications: () => ({ ...hook.state, enable: hook.enable, disable: hook.disable }),
}));

const props = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', url: '/weather/756135-warsaw', covered: true };
const STORMS_FROM_ORANGE = { group: 'storm', level: 'orange' } as const;

function setHook(state: { on: boolean; busy?: boolean; settings?: { group: string; level: string } }) {
  const settings = state.settings ?? STORMS_FROM_ORANGE;
  hook.state = {
    status: 'available',
    subscription: state.on ? { ...props, ...settings, areas: [] } : undefined,
    settings,
    busy: state.busy ?? false,
    error: null,
  };
}

async function openPanel() {
  const view = renderWithApp(<AlertBell {...props} />);
  await view.user.click(screen.getByRole('button', { name: 'Warnings' }));
  return view;
}

describe('AlertBell', () => {
  beforeEach(() => {
    hook.enable.mockReset();
    hook.disable.mockReset();
  });

  it('keeps the settings disabled while notifications are off, and turns on with the defaults', async () => {
    setHook({ on: false });
    const view = await openPanel();
    for (const name of ['Storms', 'All', 'Yellow', 'Orange', 'Red']) {
      expect(screen.getByRole('radio', { name })).toBeDisabled();
    }
    // What will apply stays marked.
    expect(screen.getByRole('radio', { name: 'Storms' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Orange' })).toBeChecked();

    await view.user.click(screen.getByRole('switch'));
    expect(hook.enable).toHaveBeenCalledWith({ group: 'storm', level: 'orange' });

    setHook({ on: true });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeEnabled();
  });

  it('shows what is stored once nothing is applying: a change from another tab', async () => {
    setHook({ on: true });
    const view = await openPanel();
    expect(screen.getByRole('radio', { name: 'Storms' })).toBeChecked();

    setHook({ on: true, settings: { group: 'all', level: 'yellow' } });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yellow' })).toBeChecked();
  });

  it('shows the latest choice while it applies, and the stored one again if it failed', async () => {
    setHook({ on: true });
    // As the real hook: busy from the click that starts a change.
    hook.enable.mockImplementation(() => {
      hook.state = { ...hook.state, busy: true };
    });
    const view = await openPanel();
    await view.user.click(screen.getByRole('radio', { name: 'All' }));
    expect(hook.enable).toHaveBeenCalledWith({ group: 'all', level: 'orange' });

    setHook({ on: true, busy: true });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();

    // Failed: the hook is idle again with the old settings.
    setHook({ on: true });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'Storms' })).toBeChecked();
  });

  it('turned off, keeps showing the settings that were on screen, and turns on with them', async () => {
    setHook({ on: true });
    const view = await openPanel();
    // Changed in another tab.
    setHook({ on: true, settings: { group: 'all', level: 'yellow' } });
    view.rerender(<AlertBell {...props} />);
    await view.user.click(screen.getByRole('switch'));
    expect(hook.disable).toHaveBeenCalled();

    setHook({ on: false });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    await view.user.click(screen.getByRole('switch'));
    expect(hook.enable).toHaveBeenCalledWith({ group: 'all', level: 'yellow' });
  });

  it('turned off in another tab, keeps the settings it last showed', async () => {
    setHook({ on: true });
    const view = await openPanel();
    setHook({ on: true, settings: { group: 'all', level: 'yellow' } });
    view.rerender(<AlertBell {...props} />);
    // Off in another tab: the hook falls back to the defaults (storms from orange).
    setHook({ on: false });
    view.rerender(<AlertBell {...props} />);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yellow' })).toBeChecked();
  });

  it('stays once shown while coverage becomes unknown, so it can still be turned off', async () => {
    setHook({ on: true });
    const view = renderWithApp(<AlertBell {...props} />);
    setHook({ on: false });
    view.rerender(<AlertBell {...props} covered={undefined} />);
    expect(screen.getByRole('button', { name: 'Warnings' })).toBeInTheDocument();
    view.rerender(<AlertBell {...props} covered={false} />);
    expect(screen.queryByRole('button', { name: 'Warnings' })).not.toBeInTheDocument();
  });
});
