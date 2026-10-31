import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsMenu } from '../../src/components/SettingsMenu';
import { renderWithApp } from './render';

// Without a Firebase config (as in tests) the "Warnings" row is not there: language and units only.
function setup(options?: Parameters<typeof renderWithApp>[1]) {
  const view = renderWithApp(<SettingsMenu />, options);
  return { ...view, gear: screen.getByRole('button', { name: 'Settings' }) };
}

describe('SettingsMenu', () => {
  it('opens on the language row and closes with Escape, giving focus back to the gear', async () => {
    const { user, gear } = setup();
    expect(gear).toHaveAttribute('aria-expanded', 'false');

    await user.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Language/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(gear).toHaveFocus();
  });

  it('switches the temperature unit and remembers it', async () => {
    const { user, gear } = setup();
    await user.click(gear);

    const celsius = screen.getByRole('button', { name: '°C' });
    const fahrenheit = screen.getByRole('button', { name: '°F' });
    expect(celsius).toHaveAttribute('aria-pressed', 'true');

    await user.click(fahrenheit);
    expect(fahrenheit).toHaveAttribute('aria-pressed', 'true');
    expect(celsius).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('temperature-unit')).toBe('fahrenheit');
  });

  it('chooses a language from the list by typing its first letters', async () => {
    const { user, gear } = setup();
    await user.click(gear);
    await user.click(screen.getByRole('button', { name: /Language/ }));

    const list = screen.getByRole('listbox', { name: 'Language' });
    expect(list).toHaveFocus();
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true');

    // "po" jumps to Polski, Enter chooses it and goes back to the panel, now in Polish.
    await user.keyboard('po{Enter}');
    expect(localStorage.getItem('language')).toBe('pl');
    expect(document.documentElement.lang).toBe('pl');
    expect(screen.getByRole('button', { name: /Język/ })).toHaveFocus();
  });

  it('steps back from the list to the panel with Escape, then closes', async () => {
    const { user, gear } = setup();
    await user.click(gear);
    await user.click(screen.getByRole('button', { name: /Language/ }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Language/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(gear).toHaveAttribute('aria-expanded', 'false');
  });
});
