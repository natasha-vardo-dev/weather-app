import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurrentWeather } from '../../src/components/CurrentWeather';
import { forecast, warsaw } from '../fixtures/weather';
import { renderWithApp } from './render';

// 12.4 °C now, feels like 10.1; today 14/6, yesterday's high 11.
const data = forecast(warsaw);

describe('CurrentWeather', () => {
  it('shows the place, the temperature and the comparison with yesterday', () => {
    renderWithApp(<CurrentWeather name="Warsaw" country="Poland" area={['Masovian Voivodeship']} forecast={data} />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Warsaw');
    expect(heading).toHaveTextContent('Poland');
    // Focus moves to the place on a new page, so screen readers announce it.
    expect(heading).toHaveFocus();
    expect(screen.getByText('Masovian Voivodeship')).toBeInTheDocument();
    // Screen readers hear words, not "12°".
    expect(screen.getByText('12 degrees')).toBeInTheDocument();
    expect(screen.getByText('Overcast')).toBeInTheDocument();
    expect(screen.getByText(/Feels like 10°/)).toHaveTextContent('High 14°, low 6°');
    expect(screen.getByText('3° warmer than yesterday')).toBeInTheDocument();
  });

  it('converts to Fahrenheit before rounding and compares in Fahrenheit', () => {
    renderWithApp(<CurrentWeather name="Warsaw" forecast={data} />, { unit: 'fahrenheit' });

    // 12.4 °C = 54.3 °F; 14 °C = 57.2 °F and 11 °C = 51.8 °F: 57 − 52 = 5°, not 3 × 1.8 rounded.
    expect(screen.getByText('54 degrees')).toBeInTheDocument();
    expect(screen.getByText('5° warmer than yesterday')).toBeInTheDocument();
  });

  it('marks the user’s own place, in the heading for screen readers', () => {
    renderWithApp(<CurrentWeather name="Warsaw" country="Poland" forecast={data} here="exact" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You are here');
  });
});
